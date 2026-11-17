// SIMULATED_CC_PURCHASE: ephemeral test keys and invented account metadata only.
import { generateKeyPairSigner, getAddressEncoder } from "@solana/kit";
import { ccPda, ccAta, type CcContext } from "./collector-crypt-inspection";
export async function simulatedCcContext() {
  const signer = await generateKeyPairSigner(),
    seller = await generateKeyPairSigner(),
    treasury = await generateKeyPairSigner(),
    mint = (await generateKeyPairSigner()).address,
    collection = (await generateKeyPairSigner()).address,
    enc = getAddressEncoder();
  const marketAddress = await ccPda(["market"]);
  const context: CcContext = {
    buyer: signer.address,
    seller: seller.address,
    mint,
    collection,
    price: "26",
    treasury: treasury.address,
    feeBps: 200,
    rentReceiver: seller.address,
    marketAddress,
    listingAddress: await ccPda([
      "listing",
      enc.encode(mint),
      enc.encode(seller.address),
    ]),
    whitelistAddress: await ccPda([
      "whitelist_entry",
      enc.encode(marketAddress),
      "CoreNFT",
      enc.encode(collection),
    ]),
    buyerAta: await ccAta(signer.address),
    sellerAta: await ccAta(seller.address),
    treasuryAta: await ccAta(treasury.address),
    slot: "1",
  };
  return { context, signer };
}
