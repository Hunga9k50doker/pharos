const ethers = require("ethers");
const { getRandomNumber, sleep } = require("./utils");
const settings = require("../config/config");

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const LIQUIDITY_CONTRACT_ABI = [
  "function addDVMLiquidity(address dvmAddress, uint256 baseInAmount, uint256 quoteInAmount, uint256 baseMinAmount, uint256 quoteMinAmount, uint8 flag, uint256 deadLine)",
];
const DVM_POOL_ADDRESS = "0xff7129709ebd3485c4ed4fef6dd923025d24e730";
const LIQUIDITY_CONTRACT = "0x4b177aded3b8bd1d5d747f91b9e853513838cd49";

const TOKENS = {
  PHRS: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  USDT: "0xD4071393f8716661958F766DF660033b3d35fD29",
  USDC: "0x72df0bcd7276f2dfbac900d1ce63c272c4bccced",
};

class AddLpService_v2 {
  constructor({ wallet, log, provider, makeRequest }) {
    this.wallet = wallet;
    this.log = log;
    this.provider = provider;
    this.makeRequest = makeRequest;
  }

  async approveToken(wallet, tokenAddr, tokenSymbol, amount, spender, decimals = 18) {
    if (tokenAddr === TOKENS.PHRS) return true;
    const contract = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
    try {
      const balance = await contract.balanceOf(wallet.address);
      if (balance < amount) {
        this.log(`Insufficient ${tokenSymbol} balance: ${ethers.formatUnits(balance, decimals)} ${tokenSymbol}`, "warning");
        return false;
      }
      const allowance = await contract.allowance(wallet.address, spender);
      if (allowance >= amount) {
        return true;
      }
      this.log(`Approving ${ethers.formatUnits(amount, decimals)} ${tokenSymbol} for spender ${spender}`);
      const tx = await contract.approve(spender, amount);
      await tx.wait();
      this.log("Approval confirmed", "success");
      return true;
    } catch (e) {
      this.log(`Approval for ${tokenSymbol} failed: ${e.message}`, "error");
      return false;
    }
  }

  async addLiquidity() {
    let amount = getRandomNumber(settings.AMOUNT_ADDLP[0], settings.AMOUNT_ADDLP[1], 6);
    const USDT_LIQUIDITY_AMOUNT = amount;
    const USDC_LIQUIDITY_AMOUNT = Math.floor((10000 / 30427) * amount);

    const wallet = this.wallet;
    this.log('Starting "Add Liquidity" process...');
    try {
      this.log("Checking USDC approval...");
      const usdcApproved = await this.approveToken(wallet, TOKENS.USDC, "USDC", USDC_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
      if (!usdcApproved) {
        throw new Error("USDC approval failed. Aborting.");
      }
      this.log("Checking USDT approval...");
      const usdtApproved = await this.approveToken(wallet, TOKENS.USDT, "USDT", USDT_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
      if (!usdtApproved) {
        throw new Error("USDT approval failed. Aborting.");
      }
      this.log("Approvals successful. Preparing to add liquidity...");
      const liquidityContract = new ethers.Contract(LIQUIDITY_CONTRACT, LIQUIDITY_CONTRACT_ABI, wallet);

      const dvmAddress = DVM_POOL_ADDRESS;
      const baseInAmount = BigInt(USDC_LIQUIDITY_AMOUNT);
      const quoteInAmount = BigInt(USDT_LIQUIDITY_AMOUNT);
      const baseMinAmount = (baseInAmount * BigInt(999)) / BigInt(1000);
      const quoteMinAmount = (quoteInAmount * BigInt(999)) / BigInt(1000);
      const flag = 0;
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await liquidityContract.addDVMLiquidity(dvmAddress, baseInAmount, quoteInAmount, baseMinAmount, quoteMinAmount, flag, deadline);

      this.log(`Add Liquidity transaction sent! TX Hash: ${tx.hash}`);
      await tx.wait();
      this.log("Transaction confirmed! Liquidity added successfully.");
    } catch (e) {
      this.log(`Add Liquidity failed: ${e.message}`);
      throw e;
    }
  }
}

module.exports = AddLpService_v2;
