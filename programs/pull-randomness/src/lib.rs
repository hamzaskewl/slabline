#![allow(unexpected_cfgs)]

use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    sysvar::{rent::Rent, slot_hashes, Sysvar},
};
use solana_system_interface::{instruction as system_instruction, program as system_program};

const VRF_PROGRAM_ID: Pubkey = pubkey!("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
const DEFAULT_QUEUE: Pubkey = pubkey!("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
const IDENTITY: &[u8] = b"identity";

const REQUEST: &[u8; 8] = b"PULLREQ1";
const CALLBACK: &[u8; 8] = b"PULLRES1";
const RECEIPT_TAG: &[u8; 8] = b"PULLVRF1";
const RECEIPT_SEED: &[u8] = b"pull-receipt";
const RECEIPT_SIZE: usize = 105;
const MAX_ORACLE_FEE_LAMPORTS: u64 = 500_000;
const ORACLE_FEE_EXCEEDS_LIMIT: u32 = 1;
const PAYER: std::ops::Range<usize> = 8..40;
const SEED: std::ops::Range<usize> = 40..72;
const STATE: usize = 72;
const RANDOMNESS: std::ops::Range<usize> = 73..105;
// Scoped regular request wire format in MagicBlock Solana VRF:
// https://github.com/magicblock-labs/solana-vrf/blob/692f98912cf028a95b28fd7879c310cde559fdb2/api/src/instruction.rs
const SCOPED_REGULAR_REQUEST: [u8; 8] = [10, 0, 0, 0, 0, 0, 0, 0];

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo<'_>],
    data: &[u8],
) -> ProgramResult {
    let (tag, args) = data
        .split_at_checked(8)
        .ok_or(ProgramError::InvalidInstructionData)?;
    if tag == REQUEST {
        let seed: &[u8; 32] = args
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?;
        request(program_id, accounts, seed)
    } else if tag == CALLBACK {
        let payload: &[u8; 64] = args
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?;
        complete(program_id, accounts, &payload[..32], &payload[32..])
    } else {
        Err(ProgramError::InvalidInstructionData)
    }
}

fn request(program_id: &Pubkey, accounts: &[AccountInfo<'_>], seed: &[u8; 32]) -> ProgramResult {
    let [payer, receipt, identity, queue, vrf, system, slot_hashes_account] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if *seed == [0; 32] {
        return Err(ProgramError::InvalidInstructionData);
    }
    if *queue.key != DEFAULT_QUEUE
        || queue.owner != &VRF_PROGRAM_ID
        || *vrf.key != VRF_PROGRAM_ID
        || !vrf.executable
        || *system.key != system_program::ID
        || *slot_hashes_account.key != slot_hashes::ID
    {
        return Err(ProgramError::IncorrectProgramId);
    }
    let (receipt_key, receipt_bump) =
        Pubkey::find_program_address(&[RECEIPT_SEED, payer.key.as_ref(), seed], program_id);
    let (identity_key, identity_bump) = Pubkey::find_program_address(&[IDENTITY], program_id);
    if receipt.key != &receipt_key || identity.key != &identity_key {
        return Err(ProgramError::InvalidSeeds);
    }
    if receipt.owner != &system_program::ID || !receipt.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let receipt_seeds: &[&[u8]] = &[RECEIPT_SEED, payer.key.as_ref(), seed, &[receipt_bump]];
    // Transfer only the rent shortfall. A third party can prefund this PDA,
    // which must not prevent its owner from creating a request.
    let rent_shortfall = Rent::get()?
        .minimum_balance(RECEIPT_SIZE)
        .saturating_sub(receipt.lamports());
    if rent_shortfall > 0 {
        invoke(
            &system_instruction::transfer(payer.key, receipt.key, rent_shortfall),
            &[payer.clone(), receipt.clone(), system.clone()],
        )?;
    }
    invoke_signed(
        &system_instruction::allocate(receipt.key, RECEIPT_SIZE as u64),
        &[receipt.clone(), system.clone()],
        &[receipt_seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(receipt.key, program_id),
        &[receipt.clone(), system.clone()],
        &[receipt_seeds],
    )?;
    {
        let mut data = receipt.try_borrow_mut_data()?;
        data[..8].copy_from_slice(RECEIPT_TAG);
        data[PAYER].copy_from_slice(payer.key.as_ref());
        data[SEED].copy_from_slice(seed);
    }

    let instruction = scoped_vrf_request(program_id, payer.key, identity.key, receipt.key, seed);
    let balance_before_oracle = payer.lamports();
    invoke_signed(
        &instruction,
        &[
            payer.clone(),
            identity.clone(),
            queue.clone(),
            system.clone(),
            slot_hashes_account.clone(),
            vrf.clone(),
        ],
        &[&[IDENTITY, &[identity_bump]]],
    )?;
    if balance_before_oracle.saturating_sub(payer.lamports()) > MAX_ORACLE_FEE_LAMPORTS {
        return Err(ProgramError::Custom(ORACLE_FEE_EXCEEDS_LIMIT));
    }
    Ok(())
}

fn scoped_vrf_request(
    program_id: &Pubkey,
    payer: &Pubkey,
    identity: &Pubkey,
    receipt: &Pubkey,
    seed: &[u8; 32],
) -> Instruction {
    // MagicBlock's Borsh request consists of the seed, callback program,
    // callback discriminator vector, callback account vector and callback args.
    let mut data = SCOPED_REGULAR_REQUEST.to_vec();
    data.extend_from_slice(seed);
    data.extend_from_slice(program_id.as_ref());
    data.extend_from_slice(&(CALLBACK.len() as u32).to_le_bytes());
    data.extend_from_slice(CALLBACK);
    data.extend_from_slice(&1u32.to_le_bytes());
    data.extend_from_slice(receipt.as_ref());
    data.extend_from_slice(&[0, 1]); // Writable callback receipt, not a signer.
    data.extend_from_slice(&(seed.len() as u32).to_le_bytes());
    data.extend_from_slice(seed);
    Instruction {
        program_id: VRF_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(*identity, true),
            AccountMeta::new(DEFAULT_QUEUE, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(slot_hashes::ID, false),
        ],
        data,
    }
}

fn complete(
    program_id: &Pubkey,
    accounts: &[AccountInfo<'_>],
    randomness: &[u8],
    seed: &[u8],
) -> ProgramResult {
    let [vrf_identity, receipt] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let (expected_identity, _) =
        Pubkey::find_program_address(&[IDENTITY, program_id.as_ref()], &VRF_PROGRAM_ID);
    if vrf_identity.key != &expected_identity || !vrf_identity.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if receipt.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut data = receipt.try_borrow_mut_data()?;
    if data.len() != RECEIPT_SIZE || &data[..8] != RECEIPT_TAG || &data[SEED] != seed {
        return Err(ProgramError::InvalidAccountData);
    }
    let (expected_receipt, _) =
        Pubkey::find_program_address(&[RECEIPT_SEED, &data[PAYER], seed], program_id);
    if receipt.key != &expected_receipt {
        return Err(ProgramError::InvalidSeeds);
    }
    if data[STATE] != 0 {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    data[RANDOMNESS].copy_from_slice(randomness);
    data[STATE] = 1;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Reference wire types from MagicBlock's RequestRandomness and
    // SerializableAccountMeta. Pubkeys serialize as their 32 raw bytes.
    #[derive(borsh::BorshSerialize)]
    struct VrfRequestFixture {
        caller_seed: [u8; 32],
        callback_program_id: [u8; 32],
        callback_discriminator: Vec<u8>,
        callback_accounts_metas: Vec<VrfAccountMetaFixture>,
        callback_args: Vec<u8>,
    }

    #[derive(borsh::BorshSerialize)]
    struct VrfAccountMetaFixture {
        pubkey: [u8; 32],
        is_signer: bool,
        is_writable: bool,
    }

    #[test]
    fn scoped_request_matches_magicblock_borsh_payload_and_account_order() {
        let program = Pubkey::new_unique();
        let payer = Pubkey::new_unique();
        let identity = Pubkey::new_unique();
        let receipt = Pubkey::new_unique();
        let seed = [9; 32];
        let request = scoped_vrf_request(&program, &payer, &identity, &receipt, &seed);
        let decoded_fixture = VrfRequestFixture {
            caller_seed: seed,
            callback_program_id: program.to_bytes(),
            callback_discriminator: b"PULLRES1".to_vec(),
            callback_accounts_metas: vec![VrfAccountMetaFixture {
                pubkey: receipt.to_bytes(),
                is_signer: false,
                is_writable: true,
            }],
            callback_args: seed.to_vec(),
        };

        assert_eq!(request.program_id, VRF_PROGRAM_ID);
        assert_eq!(
            request.accounts,
            [
                AccountMeta::new(payer, true),
                AccountMeta::new_readonly(identity, true),
                AccountMeta::new(DEFAULT_QUEUE, false),
                AccountMeta::new_readonly(system_program::ID, false),
                AccountMeta::new_readonly(slot_hashes::ID, false),
            ]
        );
        assert_eq!(&request.data[..8], &[10, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(&request.data[8..], borsh::to_vec(&decoded_fixture).unwrap());
    }

    #[test]
    fn callback_is_scoped_to_the_correct_receipt_and_only_completes_once() {
        let program = Pubkey::new_unique();
        let payer = Pubkey::new_unique();
        let wrong_payer = Pubkey::new_unique();
        let seed = [7; 32];
        let random = [10; 32];
        let (identity, _) =
            Pubkey::find_program_address(&[IDENTITY, program.as_ref()], &VRF_PROGRAM_ID);
        let (wrong_identity, _) = Pubkey::find_program_address(&[IDENTITY], &VRF_PROGRAM_ID);
        let (receipt_key, _) =
            Pubkey::find_program_address(&[RECEIPT_SEED, payer.as_ref(), &seed], &program);
        let mut lamports = 0;
        let mut identity_data = [];
        let signer = AccountInfo::new(
            &identity,
            true,
            false,
            &mut lamports,
            &mut identity_data,
            &system_program::ID,
            false,
        );
        let mut receipt_lamports = 0;
        let mut receipt_data = [0; RECEIPT_SIZE];
        receipt_data[..8].copy_from_slice(RECEIPT_TAG);
        receipt_data[PAYER].copy_from_slice(payer.as_ref());
        receipt_data[SEED].copy_from_slice(&seed);
        let receipt = AccountInfo::new(
            &receipt_key,
            false,
            true,
            &mut receipt_lamports,
            &mut receipt_data,
            &program,
            false,
        );

        let mut invalid_signer = signer.clone();
        invalid_signer.is_signer = false;
        assert_eq!(
            complete(&program, &[invalid_signer, receipt.clone()], &random, &seed),
            Err(ProgramError::MissingRequiredSignature),
        );
        let mut invalid_identity = signer.clone();
        invalid_identity.key = &wrong_identity;
        assert_eq!(
            complete(
                &program,
                &[invalid_identity, receipt.clone()],
                &random,
                &seed
            ),
            Err(ProgramError::MissingRequiredSignature),
        );
        assert_eq!(
            complete(
                &program,
                &[signer.clone(), receipt.clone()],
                &random,
                &[8; 32]
            ),
            Err(ProgramError::InvalidAccountData),
        );
        receipt.try_borrow_mut_data().unwrap()[PAYER].copy_from_slice(wrong_payer.as_ref());
        assert_eq!(
            complete(&program, &[signer.clone(), receipt.clone()], &random, &seed),
            Err(ProgramError::InvalidSeeds),
        );
        receipt.try_borrow_mut_data().unwrap()[PAYER].copy_from_slice(payer.as_ref());
        // MagicBlock sends callback discriminator, output, then callback args.
        let mut callback = b"PULLRES1".to_vec();
        callback.extend_from_slice(&random);
        callback.extend_from_slice(&seed);
        assert_eq!(
            process_instruction(
                &program,
                &[signer.clone(), receipt.clone()],
                &callback[..71]
            ),
            Err(ProgramError::InvalidInstructionData),
        );
        assert_eq!(
            process_instruction(&program, &[signer.clone(), receipt.clone()], &callback),
            Ok(()),
        );
        assert_eq!(
            complete(&program, &[signer, receipt.clone()], &[11; 32], &seed),
            Err(ProgramError::AccountAlreadyInitialized),
        );
        assert_eq!(receipt.try_borrow_data().unwrap()[STATE], 1);
        assert_eq!(receipt.try_borrow_data().unwrap()[RANDOMNESS], random);
    }
}
