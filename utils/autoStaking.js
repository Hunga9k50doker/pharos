const ethers = require("ethers");
const axios = require("axios");
const crypto = require("crypto");

// Constants
const AUTOSTAKING_BASE_URL = "https://autostaking.pro/";
const USDC_CONTRACT_ADDRESS = "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED";
const USDT_CONTRACT_ADDRESS = "0xD4071393f8716661958F766DF660033b3d35fD29";
const MUSD_CONTRACT_ADDRESS = "0x7F5e05460F927Ee351005534423917976F92495e";
const mvMUSD_CONTRACT_ADDRESS = "0xF1CF5D79bE4682D50f7A60A047eACa9bD351fF8e";
const STAKING_ROUTER_ADDRESS = "0x11cD3700B310339003641Fdce57c1f9BD21aE015";

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDWPv2qP8+xLABhn3F/U/hp76HP
e8dD7kvPUh70TC14kfvwlLpCTHhYf2/6qulU1aLWpzCz3PJr69qonyqocx8QlThq
5Hik6H/5fmzHsjFvoPeGN5QRwYsVUH07MbP7MNbJH5M2zD5Z1WEp9AHJklITbS1z
h23cf2WfZ0vwDYzZ8QIDAQAB
-----END PUBLIC KEY-----`;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function claimFaucet() returns (uint256)",
];

const AUTOSTAKING_ABI = ["function getNextFaucetClaimTime(address user) view returns (uint256)"];

const PROMPT =
  "1. Mandatory Requirement: The product's TVL must be higher than one million USD.\n" +
  "2. Balance Preference: Prioritize products that have a good balance of high current APY and high TVL.\n" +
  "3. Portfolio Allocation: Select the 3 products with the best combined ranking in terms of current APY and TVL among those with TVL > 1,000,000 USD. " +
  "To determine the combined ranking, rank all eligible products by current APY (highest to lowest) and by TVL (highest to lowest), " +
  "then sum the two ranks for each product. Choose the 3 products with the smallest sum of ranks. Allocate the investment equally among these 3 products, " +
  "with each receiving approximately 33.3% of the investment.";

class StakingSevices {
  constructor({ log, makeRequest, provider, wallet }) {
    this.wallet = wallet;
    this.provider = provider;
    this.makeRequest = makeRequest;
    this.log = log;
    this.baseApiUrl = null;
    this.authToken = null;
  }

  generateAuthToken() {
    const wallet = this.wallet.address;
    try {
      const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(address, "utf8")
      );
      return encrypted.toString("base64");
    } catch (error) {
      return null;
    }
  }

  async fetchBaseApi() {
    try {
      const response = await this.makeRequest(AUTOSTAKING_BASE_URL, "get", null, { isAuth: true });
      const html = response.data;

      const jsPattern = /src="([^"]+_next\/static\/chunks\/[^"]+\.js)"/g;
      const jsFiles = [...html.matchAll(jsPattern)].map((match) => match[1]);

      if (jsFiles.length === 0) {
        throw new Error("JS files not found");
      }

      for (const jsFile of jsFiles) {
        const jsUrl = jsFile.startsWith("http") ? jsFile : AUTOSTAKING_BASE_URL + jsFile;
        const jsResponse = await this.makeRequest(jsUrl, "get", null, { isAuth: true });
        const jsContent = jsResponse.data;
        console.log(jsContent);
        const apiPattern = /r\.Z\s*\?\s*"([^"]+)"/;
        const match = jsContent.match(apiPattern);

        if (match) {
          return match[1];
        }
      }
      return null;
    } catch (error) {
      this.log(`Error: Failed to fetch base API: ${error.message}`);
      return null;
    }
  }

  async getTokenBalance(provider, address, contractAddress) {
    try {
      const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
      const balance = await contract.balanceOf(address);
      const decimals = await contract.decimals();
      return Number(ethers.formatUnits(balance, decimals));
    } catch (error) {
      return 0;
    }
  }

  async getNextFaucetClaimTime(provider, address) {
    try {
      const contract = new ethers.Contract(mvMUSD_CONTRACT_ADDRESS, AUTOSTAKING_ABI, provider);
      const nextClaimTime = await contract.getNextFaucetClaimTime(address);
      return Number(nextClaimTime);
    } catch (error) {
      return null;
    }
  }

  async performClaimFaucet(wallet) {
    try {
      const provider = this.provider;
      const address = wallet.address;
      const contract = new ethers.Contract(mvMUSD_CONTRACT_ADDRESS, ERC20_ABI, wallet);

      const nonce = await provider.getTransactionCount(address, "pending");
      const feeData = await provider.getFeeData();

      const tx = await contract.claimFaucet({
        gasLimit: 150000,
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
        nonce: nonce,
      });

      this.log(`Claiming faucet... TX: ${tx.hash}`);
      const receipt = await tx.wait();
      return { hash: tx.hash, blockNumber: receipt.blockNumber };
    } catch (error) {
      this.log(`Err claim faucet stake ${error.message}`, "wanring");
      return null;
    }
  }

  async approveToken(wallet, tokenAddress, spenderAddress, amount) {
    try {
      const provider = wallet.provider;
      const address = wallet.address;
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

      const decimals = await contract.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);

      const allowance = await contract.allowance(address, spenderAddress);
      if (allowance >= amountWei) {
        return true;
      }

      const nonce = await provider.getTransactionCount(address, "pending");
      const feeData = await provider.getFeeData();

      const tx = await contract.approve(spenderAddress, ethers.MaxUint256, {
        gasLimit: 100000,
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
        nonce: nonce,
      });

      this.log(`Approving token... TX: ${tx.hash}`);
      await tx.wait();
      return true;
    } catch (error) {
      this.log(`Approed failed ${error.message}`, "warning");
      return false;
    }
  }
  async generateRecommendationPayload(address, usdcAmount, usdtAmount, musdAmount) {
    const usdcAssets = Math.floor(usdcAmount * 1e6);
    const usdtAssets = Math.floor(usdtAmount * 1e6);
    const musdAssets = Math.floor(musdAmount * 1e6);

    return {
      user: address,
      profile: PROMPT,
      userPositions: [],
      userAssets: [
        {
          chain: { id: 688688 },
          name: "USDC",
          symbol: "USDC",
          decimals: 6,
          address: USDC_CONTRACT_ADDRESS,
          assets: usdcAssets.toString(),
          price: 1,
          assetsUsd: usdcAmount,
        },
        {
          chain: { id: 688688 },
          name: "USDT",
          symbol: "USDT",
          decimals: 6,
          address: USDT_CONTRACT_ADDRESS,
          assets: usdtAssets.toString(),
          price: 1,
          assetsUsd: usdtAmount,
        },
        {
          chain: { id: 688688 },
          name: "MockUSD",
          symbol: "MockUSD",
          decimals: 6,
          address: MUSD_CONTRACT_ADDRESS,
          assets: musdAssets.toString(),
          price: 1,
          assetsUsd: musdAmount,
        },
      ],
      chainIds: [688688],
      tokens: ["USDC", "USDT", "MockUSD"],
      protocols: ["MockVault"],
      env: "pharos",
    };
  }

  async getFinancialPortfolioRecommendation(address, usdcAmount, usdtAmount, musdAmount) {
    try {
      const payload = await this.generateRecommendationPayload(address, usdcAmount, usdtAmount, musdAmount);

      const response = await this.makeRequest(`${this.baseApiUrl}/investment/financial-portfolio-recommendation`, "post", payload, {
        extraHeaders: {
          Authorization: this.authToken,
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          Origin: "https://autostaking.pro",
          Referer: "https://autostaking.pro/",
        },
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async generateChangeTransactions(address, changes, proxy) {
    try {
      const payload = {
        user: address,
        changes: changes,
        prevTransactionResults: {},
      };

      const response = await this.makeRequest(`${this.baseApiUrl}/investment/generate-change-transactions`, "post", payload, {
        extraHeaders: {
          Authorization: this.authToken,
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          Origin: "https://autostaking.pro",
          Referer: "https://autostaking.pro/",
        },
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async performStaking(wallet, changes) {
    try {
      const provider = this.provider;
      const address = this.wallet.address;

      const transactions = await this.generateChangeTransactions(address, changes);
      if (!transactions || !transactions.data || !transactions.data["688688"]) {
        this.log("Failed to generate transaction calldata", "warning");
        return;
      }

      const calldata = transactions.data["688688"].data;

      const nonce = await provider.getTransactionCount(address, "pending");
      const feeData = await provider.getFeeData();

      const tx = await wallet.sendTransaction({
        to: STAKING_ROUTER_ADDRESS,
        data: calldata,
        gasLimit: 500000,
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
        nonce: nonce,
      });

      this.log(`Performing staking... TX: ${tx.hash}`);
      const receipt = await tx.wait();

      return { hash: tx.hash, blockNumber: receipt.blockNumber };
    } catch (error) {
      throw error;
    }
  }

  async performAutoStakingTask({ amount }) {
    this.log("Starting AutoStaking Task...");
    const provider = this.provider;
    const wallet = this.wallet;
    const address = wallet.address;
    let usdcAmount = amount;
    let usdtAmount = amount;
    let musdAmount = amount;

    this.baseApiUrl = await this.fetchBaseApi();
    if (!this.baseApiUrl) {
      this.log("Error: Can't get API URL AutoStaking", "warning");
      return;
    }
    this.authToken = this.generateAuthToken(address);
    if (!this.authToken) {
      return;
    }

    try {
      this.log(`Checking faucet status...`);
      const nextClaimTime = await this.getNextFaucetClaimTime(provider, address);
      if (nextClaimTime !== null) {
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime >= nextClaimTime) {
          this.log(`Claiming MockUSD faucet...`);
          try {
            const faucetResult = await this.performClaimFaucet(wallet);
            this.log(`Success: Faucet claimed | Confirmed: ${faucetResult.hash}`, "success");
          } catch (error) {
            this.log(`Error: Faucet claim failed: ${error.message}`, "warning");
          }
        } else {
          const nextClaimDate = new Date(nextClaimTime * 1000).toLocaleString();
          this.log(`Warning: Faucet already claimed. Next claim at: ${nextClaimDate}`);
        }
      }

      try {
        // Check balances
        const usdcBalance = await this.getTokenBalance(provider, address, USDC_CONTRACT_ADDRESS);
        const usdtBalance = await this.getTokenBalance(provider, address, USDT_CONTRACT_ADDRESS);
        const musdBalance = await this.getTokenBalance(provider, address, MUSD_CONTRACT_ADDRESS);

        this.log(`Balances: USDC: ${usdcBalance.toFixed(2)}, USDT: ${usdtBalance.toFixed(2)}, MockUSD: ${musdBalance.toFixed(2)}`, "custom");

        // Check if sufficient balance
        if (usdcBalance < usdcAmount) {
          this.log(`Warning: Insufficient USDC balance`, "warning");
          return;
        }
        if (usdtBalance < usdtAmount) {
          this.log(`Warning: Insufficient USDT balance`, "warning");
          return;
        }
        if (musdBalance < musdAmount) {
          this.log(`Warning: Insufficient MockUSD balance`, "warning");
          return;
        }

        // Approve tokens
        this.log(`Approving USDC...`);
        await this.approveToken(wallet, USDC_CONTRACT_ADDRESS, STAKING_ROUTER_ADDRESS, usdcAmount);

        this.log(`Approving USDT...`);
        await this.approveToken(wallet, USDT_CONTRACT_ADDRESS, STAKING_ROUTER_ADDRESS, usdtAmount);

        this.log(`Approving MockUSD...`);
        await this.approveToken(wallet, MUSD_CONTRACT_ADDRESS, STAKING_ROUTER_ADDRESS, musdAmount);

        // Get portfolio recommendation
        this.log(`Getting portfolio recommendation...`);
        const portfolio = await this.getFinancialPortfolioRecommendation(address, usdcAmount, usdtAmount, musdAmount);

        if (!portfolio || !portfolio.data || !portfolio.data.changes) {
          this.log("Failed to get portfolio recommendation", "warning");
          return;
        }

        const changes = portfolio.data.changes;
        this.log(`Received ${changes.length} recommended changes`, "success");
        const stakingResult = await this.performStaking(wallet, changes);
        this.log(`Success: Staking completed | Confirmed: ${stakingResult.hash}`, "success");
      } catch (error) {
        this.log(`Error: Staking failed: ${error.message}`, "warning");
      }
    } catch (error) {
      this.log(`Error: AutoStaking failed: ${error.message}`, "warning");
    }
  }
}

module.exports = { StakingSevices };
