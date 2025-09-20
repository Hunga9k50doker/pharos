const { ethers } = require("ethers");
const axios = require("axios");
const settings = require("../config/config");
const { getRandomNumber, sleep } = require("./utils");

// Pharos Testnet configuration
const RPC_URL = "https://testnet.dplabs-internal.com";
const CHAIN_ID = 688688;
const KYC_API_URL = "https://www.spout.finance/api/kyc-signature";

// Contract addresses
const IDENTITY_FACTORY_CONTRACT = "0x18cB5F2774a80121d1067007933285B32516226a";
const GATEWAY_CONTRACT = "0x126F0c11F3e5EafE37AB143D4AA688429ef7DCB3";
const ORDERS_CONTRACT = "0x81b33972f8bdf14fD7968aC99CAc59BcaB7f4E9A";
const USDC_CONTRACT = "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED";
const RWA_TOKEN_CONTRACT = "0x54b753555853ce22f66Ac8CB8e324EB607C4e4eE";

// ABIs
const SPOUT_CONTRACT_ABI = [
  {
    type: "function",
    name: "getIdentity",
    stateMutability: "view",
    inputs: [{ internalType: "address", name: "_wallet", type: "address" }],
    outputs: [{ internalType: "address", name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getClaimIdsByTopic",
    stateMutability: "view",
    inputs: [{ internalType: "uint256", name: "_topic", type: "uint256" }],
    outputs: [{ internalType: "bytes32[]", name: "claimIds", type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "deployIdentityForWallet",
    stateMutability: "nonpayable",
    inputs: [{ internalType: "address", name: "identityOwner", type: "address" }],
    outputs: [{ internalType: "address", name: "", type: "address" }],
  },
  {
    type: "function",
    name: "addClaim",
    stateMutability: "nonpayable",
    inputs: [
      { internalType: "uint256", name: "_topic", type: "uint256" },
      { internalType: "uint256", name: "_scheme", type: "uint256" },
      { internalType: "address", name: "_issuer", type: "address" },
      { internalType: "bytes", name: "_signature", type: "bytes" },
      { internalType: "bytes", name: "_data", type: "bytes" },
      { internalType: "string", name: "_uri", type: "string" },
    ],
    outputs: [{ internalType: "bytes32", name: "claimRequestId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "buyAsset",
    stateMutability: "nonpayable",
    inputs: [
      { internalType: "uint256", name: "adfsFeedId", type: "uint256" },
      { internalType: "string", name: "ticker", type: "string" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "usdcAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sellAsset",
    stateMutability: "nonpayable",
    inputs: [
      { internalType: "uint256", name: "adfsFeedId", type: "uint256" },
      { internalType: "string", name: "ticker", type: "string" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "tokenAmount", type: "uint256" },
    ],
    outputs: [],
  },
];

const USDC_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_spender", type: "address" },
      { internalType: "uint256", name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
];

const RWA_TOKEN_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_spender", type: "address" },
      { internalType: "uint256", name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
];

const ORDERS_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "adfsFeedId", type: "uint256" },
      { internalType: "string", name: "ticker", type: "string" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "usdcAmount", type: "uint256" },
    ],
    name: "buyAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "feedId", type: "uint256" },
      { internalType: "string", name: "ticker", type: "string" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "tokenAmount", type: "uint256" },
    ],
    name: "sellAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

class SpoutServices {
  constructor({ log, makeRequest, provider, wallet }) {
    this.wallet = wallet;
    this.provider = provider;
    this.makeRequest = makeRequest;
    this.log = log;
    this.baseApiUrl = null;
    this.authToken = null;
    this.ZERO_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
    this.USDC_CONTRACT_ADDRESS = "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED";
    this.SLQD_CONTRACT_ADDRESS = "0x54b753555853ce22f66Ac8cB8e324EB607C4e4eE";
    this.GATEWAY_ROUTER_ADDRESS = "0x126F0c11F3e5EafE37AB143D4AA688429ef7DCB3";
    this.FACTORY_ROUTER_ADDRESS = "0x18cB5F2774a80121d1067007933285B32516226a";
    this.ISSUER_ROUTER_ADDRESS = "0xA5C77b623BEB3bC0071fA568de99e15Ccc06C7cb";
    this.ORDERS_ROUTER_ADDRESS = "0x81b33972f8bdf14fD7968aC99CAc59BcaB7f4E9A";
  }

  async getKYCSignature(userAddress, onchainId) {
    const payload = {
      userAddress,
      onchainIDAddress: onchainId,
      claimData: "KYC passed",
      topic: 1,
      countryCode: 91,
    };

    try {
      const response = await this.makeRequest(KYC_API_URL, "post", payload, {
        isAuth: true,
      });

      if (response.status === 200) {
        return response.data;
      } else {
        this.log(`Warning: KYC API error: ${response.status}, using fallback`, "warning");
        return this.getFallbackKYCData();
      }
    } catch (error) {
      this.log(`Warning: Using fallback KYC data: ${error.message}`, "warning");
      return this.getFallbackKYCData();
    }
  }

  getFallbackKYCData() {
    return {
      signature: {
        r: "0xb2e2622d765ed8c5ba78ffa490cecd95693571031b3954ca429925e69ed15f57",
        s: "0x614a040deef613d026382a9f745ff13963a75ff8a6f4032b177350a25364f8c4",
        v: 28,
      },
      issuerAddress: "0x92b9baA72387Fb845D8Fe88d2a14113F9cb2C4E7",
      dataHash: "0x7de3cf25b2741629c9158f89f92258972961d4357b9f027487765f655caec367",
      topic: 1,
    };
  }

  async createIdentity(wallet) {
    try {
      const contract = new ethers.Contract(IDENTITY_FACTORY_CONTRACT, SPOUT_CONTRACT_ABI, wallet);
      const salt = `wallet_${wallet.address.toLowerCase()}_${Math.floor(Date.now() / 1000)}`;

      this.log(`Creating identity with salt: ${salt}`);

      const tx = await contract.deployIdentityForWallet(wallet.address, salt, {
        gasLimit: 1000000,
        gasPrice: ethers.parseUnits("1.25", "gwei"),
      });

      this.log(`Identity creation tx: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        this.log(`Success: Identity created | Confirmed: ${tx.hash}`, "success");
        return receipt;
      } else {
        this.log(`Error: Identity creation failed`, "warning");
        return null;
      }
    } catch (error) {
      this.log(`Error: Creating identity: ${error.message}`, "warning");
      return null;
    }
  }

  async getOnchainId(provider, walletAddress) {
    try {
      const contract = new ethers.Contract(IDENTITY_FACTORY_CONTRACT, SPOUT_CONTRACT_ABI, provider);
      const result = await contract.getIdentity(walletAddress);
      if (result && result !== ethers.ZeroAddress) {
        return result;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async addClaim(wallet, onchainId, kycResponse) {
    try {
      const contract = new ethers.Contract(onchainId, SPOUT_CONTRACT_ABI, wallet);

      const { signature, issuerAddress, dataHash, topic } = kycResponse;
      const { r, s, v } = signature;

      const rHex = r.startsWith("0x") ? r.slice(2) : r;
      const sHex = s.startsWith("0x") ? s.slice(2) : s;
      const rPadded = rHex.padStart(64, "0");
      const sPadded = sHex.padStart(64, "0");
      const fullSignature = `0x${rPadded}${sPadded}${v.toString(16).padStart(2, "0")}`;
      const dataBytes = dataHash;

      this.log(`Adding KYC claim to identity: ${onchainId}`);

      const tx = await contract.addClaim(topic, 1, issuerAddress, fullSignature, dataBytes, "", {
        gasLimit: 800000,
        gasPrice: ethers.parseUnits("1.25", "gwei"),
      });

      this.log(`KYC claim tx: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        this.log(`Success: KYC claim added | Confirmed: ${tx.hash}`, "success");
        return receipt;
      } else {
        this.log(`Error: KYC claim addition failed`, "warning");
        return null;
      }
    } catch (error) {
      this.log(`Error: Adding claim: ${error.message}`, "warning");
      return null;
    }
  }

  async performKYCProcess() {
    const provider = this.provider;
    const wallet = this.wallet;
    const address = wallet.address;
    let onchainId = await this.getOnchainId(provider, address);
    if (onchainId) {
      this.log(`Success: Identity already exists: ${onchainId}`, "success");
    } else {
      this.log(`Creating new identity`);
      const receipt = await this.createIdentity(wallet);
      if (!receipt) return false;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      onchainId = await this.getOnchainId(provider, address);
      if (!onchainId) {
        this.log(`Error: Identity creation verification failed`, "warning");
        return false;
      }
    }

    this.log(`Getting KYC signature`);
    const kycResponse = await this.getKYCSignature(address, onchainId);

    try {
      const contract = new ethers.Contract(onchainId, SPOUT_CONTRACT_ABI, provider);
      const existingClaims = await contract.getClaimIdsByTopic(kycResponse.topic);
      if (existingClaims.length > 0) {
        this.log(`Success: KYC claim already exists`, "success");
        return true;
      }
    } catch (error) {
      this.log(`Warning: Error checking existing claims: ${error.message}`, "warning");
    }
    this.log(`Adding KYC claim`);
    await this.addClaim(wallet, onchainId, kycResponse);
    return true;
  }

  async buyTokens(wallet, provider, amount) {
    const address = wallet.address;

    try {
      const usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, wallet);
      const usdcBalance = await usdcContract.balanceOf(address);
      const usdcDecimals = await usdcContract.decimals();
      const usdcBalanceFormatted = Number(ethers.formatUnits(usdcBalance, usdcDecimals));

      this.log(`USDC Balance: ${usdcBalanceFormatted.toFixed(2)} USDC`);

      if (usdcBalanceFormatted < amount) {
        this.log(`Error: Insufficient USDC balance for ${amount} USDC`, "warning");
        return false;
      }

      // Check KYC status
      const existingId = await this.getOnchainId(provider, address);
      if (!existingId) {
        this.log(`Error: No identity found - complete KYC first`, "warning");
        return false;
      }

      const identityContract = new ethers.Contract(existingId, SPOUT_CONTRACT_ABI, provider);
      const existingClaims = await identityContract.getClaimIdsByTopic(1);
      if (existingClaims.length === 0) {
        this.log(`Error: No KYC claim found - complete KYC first`, "warning");
        return false;
      }

      const usdcAmountWei = ethers.parseUnits(amount.toString(), usdcDecimals);

      // Reset allowance
      this.log(`Resetting USDC allowance`);
      const resetTx = await usdcContract.approve(ORDERS_CONTRACT, 0, {
        gasLimit: 100000,
        gasPrice: ethers.parseUnits("1.25", "gwei"),
      });
      await resetTx.wait();

      // Approve
      this.log(`Approving USDC spending`);
      const approveTx = await usdcContract.approve(ORDERS_CONTRACT, usdcAmountWei, {
        gasLimit: 100000,
        gasPrice: ethers.parseUnits("1.25", "gwei"),
      });
      this.log(`Approval tx: ${approveTx.hash}`);
      await approveTx.wait();

      // Buy tokens
      this.log(`Buying ${amount} USDC worth of RWA tokens`);
      const ordersContract = new ethers.Contract(ORDERS_CONTRACT, ORDERS_ABI, wallet);
      const feedIds = [2000002, 2000001];

      for (const feedId of feedIds) {
        try {
          const buyTx = await ordersContract.buyAsset(feedId, "LQD", RWA_TOKEN_CONTRACT, usdcAmountWei, {
            gasLimit: 800000,
            gasPrice: ethers.parseUnits("1.25", "gwei"),
          });

          this.log(`Buy tx: ${buyTx.hash}`);
          const receipt = await buyTx.wait();

          if (receipt.status === 1) {
            this.log(`Success: Bought RWA tokens | Confirmed: ${buyTx.hash}`, "success");
            return true;
          }
        } catch (buyError) {
          this.log(`Warning: Buy failed with feedId ${feedId}: ${buyError.message}`, "warning");
        }
      }

      this.log(`Error: All buy attempts failed`, "warning");
      return false;
    } catch (error) {
      this.log(`Error: Buy tokens failed: ${error.message}`, "warning");
      return false;
    }
  }

  async sellTokens(wallet, provider, amount) {
    const address = wallet.address;

    try {
      const rwaContract = new ethers.Contract(RWA_TOKEN_CONTRACT, RWA_TOKEN_ABI, wallet);
      const tokenBalance = await rwaContract.balanceOf(address);
      const tokenDecimals = await rwaContract.decimals();
      const tokenBalanceFormatted = Number(ethers.formatUnits(tokenBalance, tokenDecimals));

      this.log(`RWA Token Balance: ${tokenBalanceFormatted.toFixed(4)} LQD`);

      if (tokenBalanceFormatted < amount) {
        this.log(`Error: Insufficient token balance for ${amount} LQD`, "warning");
        return false;
      }

      // Check KYC status
      const existingId = await this.getOnchainId(provider, address);
      if (!existingId) {
        this.log(`Error: No identity found - complete KYC first`, "warning");
        return false;
      }

      const tokenAmountWei = ethers.parseUnits(amount.toString(), tokenDecimals);

      // Reset allowance
      this.log(`Resetting token allowance`);
      const resetTx = await rwaContract.approve(ORDERS_CONTRACT, 0, {
        gasLimit: 100000,
        gasPrice: ethers.parseUnits("1.25", "gwei"),
      });
      await resetTx.wait();

      // Approve
      this.log(`Approving token spending`);
      const approveTx = await rwaContract.approve(ORDERS_CONTRACT, tokenAmountWei, {
        gasLimit: 100000,
        gasPrice: ethers.parseUnits("1.25", "gwei"),
      });
      this.log(`Approval tx: ${approveTx.hash}`);
      await approveTx.wait();

      // Sell tokens
      this.log(`Selling ${amount} RWA tokens`);
      const ordersContract = new ethers.Contract(ORDERS_CONTRACT, ORDERS_ABI, wallet);
      const feedIds = [2000002, 2000001];

      for (const feedId of feedIds) {
        try {
          const sellTx = await ordersContract.sellAsset(feedId, "LQD", RWA_TOKEN_CONTRACT, tokenAmountWei, {
            gasLimit: 800000,
            gasPrice: ethers.parseUnits("1.25", "gwei"),
          });

          this.log(`Sell tx: ${sellTx.hash}`);
          const receipt = await sellTx.wait();

          if (receipt.status === 1) {
            this.log(`Success: Sold RWA tokens | Confirmed: ${sellTx.hash}`, "success");
            return true;
          }
        } catch (sellError) {
          this.log(`Warning: Sell failed with feedId ${feedId}: ${sellError.message}`, "warning");
        }
      }

      this.log(`Error: All sell attempts failed`, "warning");
      return false;
    } catch (error) {
      this.log(`Error: Sell tokens failed: ${error.message}`, "warning");
      return false;
    }
  }

  async performSpoutTask() {
    this.log("Starting Spout Task...");
    const provider = this.provider;
    const wallet = this.wallet;
    for (const option of settings.SPOUT_OPTIONS) {
      if (option === "kyc") {
        const balance = await provider.getBalance(wallet.address);
        if (balance === 0n) {
          this.log(`No balance, skipping KYC`, "warning");
        } else {
          await this.performKYCProcess();
          this.log("KYC process completed!", "success");
        }
      } else if (["buy", "sell"].includes(option)) {
        const transactionCount = getRandomNumber(settings.NUMBER_SPOUT[0], settings.NUMBER_SPOUT[1]);
        for (let txNum = 1; txNum <= transactionCount; txNum++) {
          this.log(`Starting transaction round ${txNum}/${transactionCount}`);

          const randomAmount = getRandomNumber(settings.AMOUNT_SPOUT[0], settings.AMOUNT_SPOUT[1], 6);
          this.log(`Transaction ${txNum}: Amount: ${randomAmount}`);

          // Buy tokens if enabled
          if (option == "buy") {
            this.log(`Processing buy transaction ${txNum}`);
            await this.buyTokens(wallet, provider, randomAmount);
          }

          // Sell tokens if enabled
          if (option == "sell") {
            this.log(`Processing sell transaction ${txNum}`);
            await this.sellTokens(wallet, provider, randomAmount);
          }

          if (txNum < transactionCount) {
            this.log(`Waiting ${randomDelay} seconds before next transaction round`);
            const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
            this.log(`Waiting ${timesleep} seconds for next trade...`);
            await sleep(timesleep);
          }
        }
      } else {
        return this.log(`Invalid option spout: ${option}`, "error");
      }
    }
  }
}

module.exports = { SpoutServices };
