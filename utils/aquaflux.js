const { ethers } = require("ethers");
const settings = require("../config/config");

const AQUAFLUX_NFT_ABI = ["function claimTokens()", "function mint(uint256 nftType, uint256 expiresAt, bytes signature)"];
const AQUAFLUX_NFT_CONTRACT = "0xcc8cf44e196cab28dba2d514dc7353af0efb370e";
const AQUAFLUX_TOKENS = {
  P: "0xb5d3ca5802453cc06199b9c40c855a874946a92c",
  C: "0x4374fbec42e0d46e66b379c0a6072c910ef10b32",
  S: "0x5df839de5e5a68ffe83b89d430dc45b1c5746851",
  CS: "0xceb29754c54b4bfbf83882cb0dcef727a259d60a",
};
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

class AquaFluxService {
  constructor({ wallet, provider, makeRequest, log }) {
    this.wallet = wallet;
    this.provider = provider;
    this.makeRequest = makeRequest;
    this.log = log;
  }

  createCalldata(walletAddress, TEMPLATE = BYTES_TEMPLATE) {
    const cleanAddress = walletAddress.replace("0x", "").toLowerCase();
    return TEMPLATE.replace("{WALLET_ADDRESS}", cleanAddress);
  }

  async claimTokens() {
    const wallet = this.wallet;
    this.log("Claiming free AquaFlux tokens (C & S)...");
    try {
      const nftContract = new ethers.Contract(AQUAFLUX_NFT_CONTRACT, AQUAFLUX_NFT_ABI, wallet);
      const tx = await nftContract.claimTokens({ gasLimit: 300000 });
      this.log(`Claim tokens transaction sent! TX Hash: ${tx.hash}`, "success");
      await tx.wait();
      this.log("Tokens claimed successfully!", "success");

      return true;
    } catch (e) {
      if (e.message.includes("already claimed")) {
        this.log("Tokens have already been claimed for today.", "warning");
        return true;
      }
      this.log(`Claim tokens failed: ${e.message}`, "error");
      return false;
    }
  }

  async craftTokens() {
    const wallet = this.wallet;
    this.log("Crafting 100 CS tokens from C and S tokens...");
    try {
      const cTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.C, ERC20_ABI, wallet);
      const sTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.S, ERC20_ABI, wallet);
      const csTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.CS, ERC20_ABI, wallet);

      const requiredAmount = ethers.parseUnits("100", 18);

      const cBalance = await cTokenContract.balanceOf(wallet.address);
      if (cBalance < requiredAmount) {
        throw new Error(`Insufficient C tokens. Required: 100, Available: ${ethers.formatUnits(cBalance, 18)}`);
      }

      const sBalance = await sTokenContract.balanceOf(wallet.address);
      if (sBalance < requiredAmount) {
        throw new Error(`Insufficient S tokens. Required: 100, Available: ${ethers.formatUnits(sBalance, 18)}`);
      }

      const cAllowance = await cTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
      if (cAllowance < requiredAmount) {
        this.log("Approving C tokens...");
        const cApproveTx = await cTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
        await cApproveTx.wait();
        this.log("C tokens approved", "success");
      }

      const sAllowance = await sTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
      if (sAllowance < requiredAmount) {
        this.log("Approving S tokens...");
        const sApproveTx = await sTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
        await sApproveTx.wait();
        this.log("S tokens approved", "success");
      }

      const csBalanceBefore = await csTokenContract.balanceOf(wallet.address);
      this.log("Crafting CS tokens...");

      const CRAFT_METHOD_ID = "0x4c10b523";
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedParams = abiCoder.encode(["uint256"], [requiredAmount]);
      const calldata = CRAFT_METHOD_ID + encodedParams.substring(2);

      const craftTx = await wallet.sendTransaction({
        to: AQUAFLUX_NFT_CONTRACT,
        data: calldata,
        gasLimit: 300000,
      });

      this.log(`Crafting transaction sent! TX Hash: ${craftTx.hash}`);
      const receipt = await craftTx.wait();

      if (receipt.status === 0) {
        throw new Error("Crafting transaction reverted on-chain");
      }

      this.log("Crafting transaction confirmed.");

      const csBalanceAfter = await csTokenContract.balanceOf(wallet.address);
      const craftedAmount = csBalanceAfter - csBalanceBefore;

      this.log(`CS Token balance after crafting: ${ethers.formatUnits(csBalanceAfter, 18)}`);
      this.log(`Successfully crafted: ${ethers.formatUnits(craftedAmount, 18)} CS tokens`, "success");

      if (craftedAmount < requiredAmount) {
        throw new Error(`Crafting incomplete. Expected 100 CS tokens, got ${ethers.formatUnits(craftedAmount, 18)}`);
      }

      return true;
    } catch (e) {
      this.log(`Craft tokens failed: ${e.reason || e.message}`);
      return false;
    }
  }

  async checkTokenHolding(accessToken) {
    try {
      const response = await this.makeRequest("https://api.aquaflux.pro/api/v1/users/check-token-holding", "post", null, {
        extraHeaders: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.success) {
        const isHolding = response.data.isHoldingToken;
        this.log(JSON.stringify(response.data));
        return isHolding;
      } else {
        throw new Error("Check holding failed: " + JSON.stringify(response.data));
      }
    } catch (e) {
      this.log(`Check token holding failed: ${e.message}`, "error");
      throw e;
    }
  }

  async aquaFluxLogin() {
    const wallet = this.wallet;
    try {
      const timestamp = Date.now();
      const message = `Sign in to AquaFlux with timestamp: ${timestamp}`;
      const signature = await wallet.signMessage(message);
      const response = await this.makeRequest(
        "https://api.aquaflux.pro/api/v1/users/wallet-login",
        "post",
        {
          address: this.wallet.address,
          message: message,
          signature: signature,
        },
        {
          isAuth: true,
        }
      );
      if (response.success) {
        return response.data.accessToken;
      } else {
        throw new Error("Login failed: " + JSON.stringify(response.data));
      }
    } catch (e) {
      this.log(`AquaFlux login failed: ${e.message}`, "warning");
      throw e;
    }
  }

  async getSignature(accessToken, nftType = 0) {
    try {
      const response = await this.makeRequest(
        "https://api.aquaflux.pro/api/v1/users/get-signature",
        "post",
        {
          walletAddress: this.wallet.address,
          requestedNftType: nftType,
        },
        {
          extraHeaders: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.success) {
        return response.data;
      } else {
        throw new Error("Get signature failed: " + JSON.stringify(response.data));
      }
    } catch (e) {
      this.log(`Get signature failed: ${e.message}`, "warning");
      throw e;
    }
  }

  async mintNFT(signatureData) {
    const wallet = this.wallet;
    this.log("Minting AquaFlux NFT...");
    try {
      const csTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.CS, ERC20_ABI, wallet);
      const requiredAmount = ethers.parseUnits("100", 18);

      const csBalance = await csTokenContract.balanceOf(wallet.address);
      if (csBalance < requiredAmount) {
        throw new Error(`Insufficient CS tokens. Required: 100, Available: ${ethers.formatUnits(csBalance, 18)}`);
      }

      const allowance = await csTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
      if (allowance < requiredAmount) {
        const approvalTx = await csTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
        await approvalTx.wait();
      }

      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime >= signatureData.expiresAt) {
        throw new Error(`Signature is already expired! Check your system's clock.`);
      }

      const CORRECT_METHOD_ID = "0x75e7e053";
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedParams = abiCoder.encode(["uint256", "uint256", "bytes"], [signatureData.nftType, signatureData.expiresAt, signatureData.signature]);
      const calldata = CORRECT_METHOD_ID + encodedParams.substring(2);

      const tx = await wallet.sendTransaction({
        to: AQUAFLUX_NFT_CONTRACT,
        data: calldata,
        gasLimit: 400000,
      });

      this.log(`NFT mint transaction sent! TX Hash: ${tx.hash}`, "success");
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction reverted on-chain. Check the transaction on a block explorer.");
      }

      this.log(`NFT minted successfully! TX Hash: ${tx.hash}`, "success");

      return true;
    } catch (e) {
      this.log(`NFT mint failed: ${e.reason || e.message}`, "warning");
      throw e;
    }
  }

  async executeAquaFluxFlow() {
    try {
      const accessToken = await this.aquaFluxLogin();
      await this.claimTokens();
      await this.craftTokens();
      await this.checkTokenHolding(accessToken);
      const signatureData = await this.getSignature(accessToken);
      await this.mintNFT(signatureData);
      this.log("AquaFlux flow completed successfully!", "success");
      return true;
    } catch (e) {
      this.log(`AquaFlux flow failed: ${e.message}`, "warning");
      return false;
    }
  }
}

module.exports = AquaFluxService;
