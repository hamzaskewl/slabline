import {
  parseAbi,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  PERMIT2,
  type EvmChainId,
  type GrailQuote,
  type PoolKey,
} from "@collectible/domain";

// Official deployments, checked against onchain factory/poolManager getters.
// https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
// https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments
// https://developers.uniswap.org/docs/protocols/v4/deployments
export const uniswap = {
  8453: {
    factory: "0x33128a8fc17869897dce68ed026d694621f6fdfd",
    quoterV3: "0x3d4e44eb1374240ce5f1b871ab261cd16335b76a",
    routerV3: "0x2626664c2603336e57b271c5c0b26f421741e481",
    manager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    quoterV4: "0xe1a6c5803e3c44368b171bd680c7d32dfc92ca47",
    stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
    routerV4: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  },
  4663: {
    factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
    quoterV3: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
    routerV3: "0xcaf681a66d020601342297493863e78c959e5cb2",
    manager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    quoterV4: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
    stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
    routerV4: "0x8876789976decbfcbbbe364623c63652db8c0904",
  },
} as const satisfies Record<EvmChainId, Record<string, Address>>;

export const v3Abi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function factory() view returns (address)",
  "function getPool(address,address,uint24) view returns (address)",
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);
export const v4Abi = parseAbi([
  "function poolManager() view returns (address)",
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export const permit2Abi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const poolKeyAbi = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const;
export function poolId(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters([poolKeyAbi], [key]));
}

export function validatePoolKey(key: PoolKey, buyToken: Address, id: Hex) {
  if (
    key.hooks !== zeroAddress ||
    key.currency0 === zeroAddress ||
    BigInt(key.currency0) >= BigInt(key.currency1) ||
    ![key.currency0, key.currency1].includes(
      buyToken.toLowerCase() as Address,
    ) ||
    key.fee < 0 ||
    key.fee >= 1000000 ||
    key.tickSpacing <= 0 ||
    poolId(key) !== id.toLowerCase()
  )
    throw new Error(
      "Unsupported or mismatched Grail v4 pool. No custom hooks or native-currency pools are enabled.",
    );
}
export function effectiveV4Fee(
  protocolFee: number,
  lpFee: number,
  zeroForOne: boolean,
) {
  const directional = zeroForOne ? protocolFee & 0xfff : protocolFee >> 12;
  if (directional > 1000 || lpFee >= 1000000)
    throw new Error("Unsupported pool fee.");
  return directional + lpFee - Math.floor((directional * lpFee) / 1000000);
}
export function minimumOutput(output: bigint, bps: number) {
  if (output <= 0n || !Number.isInteger(bps) || bps < 10 || bps > 100)
    throw new Error("Invalid output or slippage.");
  const minimum = (output * BigInt(10000 - bps)) / 10000n;
  if (minimum <= 0n) throw new Error("Amount is too small.");
  return minimum;
}

// No provider-supplied calldata. The only supported calls are encoded here.
export function encodeGrailAction(q: GrailQuote): {
  to: Address;
  data: Hex;
  value: "0x0";
} {
  const cfg = uniswap[q.chainId],
    deadline = Math.floor(Date.parse(q.expiresAt) / 1000);
  const amount = BigInt(q.sellAmount),
    minimum = BigInt(q.minBuyAmount);
  const expectedRouter = q.protocol === "v3" ? cfg.routerV3 : cfg.routerV4;
  const expectedSpender = q.protocol === "v3" ? cfg.routerV3 : PERMIT2;
  if (
    q.router !== expectedRouter ||
    q.spender !== expectedSpender ||
    amount <= 0n ||
    minimum <= 0n ||
    !Number.isSafeInteger(deadline)
  )
    throw new Error("Invalid stored swap terms.");
  if (q.nextAction === "approve_token")
    return {
      to: q.sellToken,
      value: "0x0",
      data: encodeFunctionData({
        abi: parseAbi([
          "function approve(address spender,uint256 amount) returns (bool)",
        ]),
        functionName: "approve",
        args: [q.spender, amount],
      }),
    };
  if (q.nextAction === "approve_router") {
    if (q.protocol !== "v4")
      throw new Error("Permit2 is only needed for this v4 route.");
    return {
      to: PERMIT2,
      value: "0x0",
      data: encodeFunctionData({
        abi: permit2Abi,
        functionName: "approve",
        args: [q.sellToken, q.router, amount, deadline + 300],
      }),
    };
  }
  if (q.protocol === "v3") {
    const swap = encodeFunctionData({
      abi: v3Abi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: q.sellToken,
          tokenOut: q.buyToken,
          fee: q.feePips,
          recipient: q.wallet,
          amountIn: amount,
          amountOutMinimum: minimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    return {
      to: q.router,
      value: "0x0",
      data: encodeFunctionData({
        abi: v3Abi,
        functionName: "multicall",
        args: [BigInt(deadline), [swap]],
      }),
    };
  }
  if (!q.poolKey) throw new Error("Missing v4 pool key.");
  validatePoolKey(q.poolKey, q.buyToken, q.pool);
  // Uniswap V4_SWAP; exact input, settle bounded input, take output to msg.sender.
  // https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping
  const params = [
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { ...poolKeyAbi, name: "poolKey" },
            { name: "zeroForOne", type: "bool" },
            { name: "amountIn", type: "uint128" },
            { name: "amountOutMinimum", type: "uint128" },
            { name: "hookData", type: "bytes" },
          ],
        },
      ],
      [
        {
          poolKey: q.poolKey,
          zeroForOne: q.sellToken === q.poolKey.currency0,
          amountIn: amount,
          amountOutMinimum: minimum,
          hookData: "0x",
        },
      ],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [q.sellToken, amount],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [q.buyToken, minimum],
    ),
  ];
  const inputs = [
    encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes[]" }],
      ["0x060c0f", params],
    ),
  ];
  return {
    to: q.router,
    value: "0x0",
    data: encodeFunctionData({
      abi: v4Abi,
      functionName: "execute",
      args: ["0x10", inputs, BigInt(deadline)],
    }),
  };
}
