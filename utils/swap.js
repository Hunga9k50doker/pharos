const { ethers } = require("ethers");
const settings = require("../config/config");
const EXPOLER = "https://testnet.pharosscan.xyz/tx/";

const SWAP_CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "collectionAndSelfcalls", type: "uint256" },
      { internalType: "bytes[]", name: "data", type: "bytes[]" },
    ],
    name: "multicall",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];
const SWAP_ROUTER_ADDRESS = "0x1a4de519154ae51200b0ad7c90f7fac75547888a";
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function deposit() payable returns ()",
  "function withdraw(uint256 wad) returns ()",
  "function multicall(uint256, bytes[]) public payable returns (bytes[] memory)",
  "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) external payable returns (uint256)",
];

const pairOptions = [
  { id: 1, from: "WPHRS", to: "USDC" },
  { id: 2, from: "USDC", to: "WPHRS" },
  { id: 3, from: "WPHRS", to: "USDT" },
  { id: 4, from: "USDT", to: "WPHRS" },
  // { id: 5, from: "PHRS", to: "USDT" },
  // { id: 6, from: "USDT", to: "PHRS" },
  // { id: 7, from: "PHRS", to: "USDC" },
  // { id: 8, from: "USDC", to: "PHRS" },
];
const tokenDecimals = {
  PHRS: 18,
  WPHRS: 18,
  USDC: 6,
  USDT: 6,
};

const tokens = {
  USDC: "0x72df0bcd7276f2dfbac900d1ce63c272c4bccced",
  USDT: "0xd4071393f8716661958f766df660033b3d35fd29",
  PHRS: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  WPHRS: "0x76aaada469d23216be5f7c596fa25f282ff9b364",
};

class SwapService {
  constructor({ wallet, log, provider }) {
    this.wallet = wallet;
    this.log = log;
    this.provider = provider;
  }

  checkBalanceAndApproval = async (tokenAddress, amount, decimals, spender) => {
    const wallet = this.wallet;
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    try {
      const symbol = Object.entries(tokens).find((item) => item[1] === tokenAddress)[0];
      const balance = await tokenContract.balanceOf(wallet.address);
      const required = ethers.parseUnits(amount.toString(), decimals);

      if (balance < required) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: `Insufficient ${symbol} balance: ${ethers.formatUnits(balance, decimals)} < ${amount}`,
        };
      }

      const allowance = await tokenContract.allowance(wallet.address, spender);
      if (allowance < required) {
        const approveTx = await tokenContract.approve(spender, required);
        await approveTx.wait();
      }

      return {
        tx: null,
        success: true,
        message: `200`,
      };
    } catch (error) {
      if (error.message.includes("TX_REPLAY_ATTACK")) {
        this.log("Retrying with incremented nonce...");
        const nonce = (await wallet.provider.getTransactionCount(wallet.address, "latest")) + 1;
        const tx = await tokenContract.approve(spender, amount, { nonce });
        await tx.wait();
        return true;
      }
      return {
        tx: null,
        success: false,
        stop: true,
        message: `Balance/approval check failed: ${error.shortMessage ?? error.message}`,
      };
    }
  };

  async generateMulticallData({ tokenIn, tokenOut, amountIn, decimals }) {
    try {
      const contract = new ethers.Contract(SWAP_ROUTER_ADDRESS, SWAP_CONTRACT_ABI, this.wallet);
      const deadline = Math.floor(Date.now() / 1000) + 600; // 10 phút hợp lệ

      const amountToWei = ethers.parseUnits(amountIn.toString(), decimals);

      const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint256", "address", "uint256", "uint256", "uint256"],
        [ethers.getAddress(tokenIn), ethers.getAddress(tokenOut), 500n, ethers.getAddress(this.wallet.address), amountToWei, 0n, 0n]
      );

      const methodId = "0x04e45aaf";
      const multicallData = [methodId + encodedArgs.slice(2)];

      return contract.interface.encodeFunctionData("multicall", [deadline, multicallData]);
    } catch (e) {
      throw new Error(`Generate Multicall Data Failed: ${e.message}`);
    }
  }

  async swapToken(params) {
    const wallet = this.wallet;
    const provider = this.provider;
    const { amount: amountIn, pairsInit } = params;

    try {
      const options = pairsInit ? pairsInit : pairOptions;
      const pair = options[Math.floor(Math.random() * options.length)];
      const decimals = tokenDecimals[pair.from];
      const tokenIn = tokens[pair.from];
      const tokenOut = tokens[pair.to];
      const requiredAmount = ethers.parseUnits(amountIn.toString(), decimals);
      const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, wallet);
      const isNative = pair.from === "PHRS";
      // Check balance
      const balance = isNative ? await provider.getBalance(wallet.address) : await tokenContract.balanceOf(wallet.address);
      if (balance < requiredAmount) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: `Insufficient ${pair.from} balance: ${ethers.formatUnits(balance, decimals)} < ${amountIn}`,
        };
      }

      // Approve if needed
      if (tokenIn !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        const res = await this.checkBalanceAndApproval(tokenIn, amountIn, decimals, SWAP_ROUTER_ADDRESS);
        if (!res.success) return res;
      }

      this.log(`Swapping ${amountIn} ${pair.from} to ${pair.to}`.blue);

      // Build calldata
      const calldata = await this.generateMulticallData({
        tokenIn,
        tokenOut,
        amountIn,
        decimals,
      });

      const gasLimit = Math.ceil(260000 * 1.2);
      const nonce = await provider.getTransactionCount(wallet.address, "pending");
      const maxPriorityFee = ethers.parseUnits("1", "gwei");

      const txRequest = {
        from: wallet.address,
        to: SWAP_ROUTER_ADDRESS,
        data: calldata,
        gasLimit,
        maxFeePerGas: maxPriorityFee,
        maxPriorityFeePerGas: maxPriorityFee,
        nonce,
        chainId: settings.CHAIN_ID,
        type: 2,
      };

      const tx = await wallet.sendTransaction(txRequest);
      await tx.wait(3);

      return {
        tx: tx.hash,
        success: true,
        message: `Swap ${amountIn} ${pair.from} to ${pair.to} success: ${EXPOLER}${tx.hash}`,
      };
    } catch (error) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `Swap failed: ${error.shortMessage ?? error.message}`,
      };
    }
  }
}

module.exports = SwapService;
