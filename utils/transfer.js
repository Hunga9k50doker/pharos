const { ethers } = require("ethers");
const settings = require("../config/config");

const EXPOLER = `${settings.EXPOLER}/tx/`;
const PRIMUS_TIP_CONTRACT = "0xd17512b7ec12880bd94eca9d774089ff89805f02";
const PRIMUS_TIP_ABI = ["function tip((uint32,address) token, (string,string,uint256,uint256[]) recipient)"];

class TransferService {
  constructor({ wallet, provider }) {
    this.wallet = wallet;
    this.provider = provider;
  }

  getTransactionCountWithRetry = async (walletAddress) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await provider.getTransactionCount(walletAddress, "pending");
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) throw error; // Re-throw if it's the last attempt
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait before retrying
      }
    }
  };

  async sendToken({ recipientAddress, amount }) {
    try {
      const wallet = this.wallet;
      const provider = this.provider;
      const amountIn = ethers.parseEther(amount.toString());
      const balance = await provider.getBalance(wallet.address);

      const balanceInEther = ethers.formatEther(balance);

      if (parseFloat(balanceInEther) < parseFloat(amount) + 0.0005) {
        return {
          tx: null,
          success: false,
          stop: true,
          message: "Insufficient PHRS for transfer",
        };
      }

      const minBalance = amountIn + ethers.parseEther("0.000021");
      if (balance < minBalance) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: `Insufficient PHRS. Need at least ${ethers.formatEther(minBalance)} PHRS, have ${ethers.formatEther(balance)} PHRS.`,
        };
      }

      const tx = await wallet.sendTransaction({
        to: recipientAddress,
        value: amountIn,
        gasLimit: 21000,
      });
      await tx.wait(3);

      return {
        tx: tx.hash,
        success: true,
        message: `Send ${amount} PHRS successful! Transaction hash: ${EXPOLER}${tx.hash}`,
      };
    } catch (error) {
      if (error.code === "NONCE_EXPIRED" || error.message.includes("TX_REPLAY_ATTACK")) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: "Nonce conflict detected. Please retry the transaction.",
        };
      }
      return {
        tx: null,
        success: false,
        stop: true,
        message: `Error Send: ${error.message}`,
      };
    }
  }

  async sendTokenToX({ recipient, amount }) {
    try {
      const wallet = this.wallet;
      const provider = this.provider;
      const amountIn = ethers.parseEther(amount.toString());
      const balance = await provider.getBalance(wallet.address);

      const balanceInEther = ethers.formatEther(balance);

      if (parseFloat(balanceInEther) < parseFloat(amount) + 0.0005) {
        return {
          tx: null,
          success: false,
          stop: true,
          message: "Insufficient PHRS for transfer",
        };
      }

      const minBalance = amountIn + ethers.parseEther("0.000021");
      if (balance < minBalance) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: `Insufficient PHRS. Need at least ${ethers.formatEther(minBalance)} PHRS, have ${ethers.formatEther(balance)} PHRS.`,
        };
      }

      const tipContract = new ethers.Contract(PRIMUS_TIP_CONTRACT, PRIMUS_TIP_ABI, wallet);

      const tokenStruct = [1, "0x0000000000000000000000000000000000000000"];

      const recipientStruct = ["x", recipient, amount, []];

      const tx = await tipContract.tip(tokenStruct, recipientStruct, {
        value: amount,
      });

      await tx.wait(3);

      return {
        tx: tx.hash,
        success: true,
        message: `Send ${amount} PHRS to ${recipient} successful! Transaction hash: ${EXPOLER}${tx.hash}`,
      };
    } catch (error) {
      if (error.code === "NONCE_EXPIRED" || error.message.includes("TX_REPLAY_ATTACK")) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: "Nonce conflict detected. Please retry the transaction.",
        };
      }
      return {
        tx: null,
        success: false,
        stop: true,
        message: `Error Send: ${error.message}`,
      };
    }
  }

  async sendAllToken({ recipientAddress }) {
    try {
      const wallet = this.wallet;
      const provider = this.provider;

      // Lấy số dư hiện tại
      const balance = await provider.getBalance(wallet.address);

      // Tính toán 95% số dư
      const amountIn = (balance * 90n) / 100n;

      // Kiểm tra số dư
      const balanceInEther = ethers.formatEther(balance);

      if (parseFloat(balanceInEther) < 0.0005) {
        return {
          tx: null,
          success: false,
          stop: true,
          message: "Insufficient PHRS for transfer",
        };
      }

      const minBalance = amountIn + ethers.parseEther("0.000021");
      if (balance < minBalance) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: `Insufficient PHRS. Need at least ${ethers.formatEther(minBalance)} PHRS, have ${ethers.formatEther(balance)} PHRS.`,
        };
      }

      const tx = await wallet.sendTransaction({
        to: recipientAddress,
        value: amountIn,
        gasLimit: 21000,
      });
      await tx.wait(3);

      return {
        tx: tx.hash,
        success: true,
        message: `Send ${ethers.formatEther(amountIn)} PHRS successful! Transaction hash: ${EXPOLER}${tx.hash}`,
      };
    } catch (error) {
      if (error.code === "NONCE_EXPIRED" || error.message.includes("TX_REPLAY_ATTACK")) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: "Nonce conflict detected. Please retry the transaction.",
        };
      }
      return {
        tx: null,
        success: false,
        stop: true,
        message: `Error Send: ${error.message}`,
      };
    }
  }
}

module.exports = TransferService;
