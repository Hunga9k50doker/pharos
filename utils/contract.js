const { ethers } = require("ethers");

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function deposit() payable returns ()",
  "function withdraw(uint256 wad) returns ()",
];

const TOKEN_ADDRESSES = {
  WPHRS: "0x76aaada469d23216be5f7c596fa25f282ff9b364", // Wrapped PHRS
  USDC: "0x72df0bcd7276f2dfbac900d1ce63c272c4bccced",
  USDT: "0xd4071393f8716661958f766df660033b3d35fd29",
};

async function checkBalance({ address: tokenAddress, provider, wallet }) {
  try {
    if (tokenAddress) {
      const tokenContract = new ethers.Contract(String(tokenAddress).toLowerCase(), ERC20_ABI, wallet);
      const balance = await tokenContract.balanceOf(wallet.address);
      const decimals = String(tokenAddress).toLowerCase() == TOKEN_ADDRESSES.USDT.toLowerCase() || String(tokenAddress).toLowerCase() == TOKEN_ADDRESSES.USDC.toLowerCase() ? 6 : 18;

      return parseFloat(ethers.formatUnits(balance, decimals)).toFixed(4);
    } else {
      const balance = await provider.getBalance(wallet.address);
      return parseFloat(ethers.formatEther(balance)).toFixed(4);
    }
  } catch (error) {
    console.log(`[${wallet.address}] Failed to check balance: ${error.message}`);
    return "0";
  }
}

module.exports = { checkBalance };
