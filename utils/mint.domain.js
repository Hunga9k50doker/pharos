const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sleep } = require("./utils");
const settingsGlobal = require("../config/config");

require("colors");

const settings = {
  NUMBER_MINT_NAME: settingsGlobal.NUMBER_MINT_NAME,
  RENT_YEARS: settingsGlobal.RENT_YEARS, // Số năm thuê
  COMMIT_WAIT_SECONDS: settingsGlobal.COMMIT_WAIT_SECONDS, // Thời gian chờ sau khi commit
  DELAY_BETWEEN_REQUESTS: settingsGlobal.DELAY_BETWEEN_REQUESTS,

  RESOLVER: "0x9a43dcA1C3BB268546b98eb2AB1401bFc5b58505",
  DATA: [],
  REVERSE_RECORD: false,
  OWNER_CONTROLLED_FUSES: 0,
};

const EXPLORER = "https://testnet.pharosscan.xyz/tx/";
const CONTRACT_ADDRESS = "0x51bE1EF20a1fD5179419738FC71D95A8b6f8A175";
const ONE_YEAR = 31536000;

const CONTRACT_ABI = [
  "function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) public pure returns (bytes32)",
  "function commit(bytes32 commitment) public",
  "function rentPrice(string name, uint256 duration) public view returns (tuple(uint256 base, uint256 premium))",
  "function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) public payable",
  "function available(string) view returns (bool)",
  "function minCommitmentAge() view returns (uint256)",
];

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomChars(length = 3) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

class MintNameService {
  constructor({ wallet, log, provider }) {
    this.wallet = wallet;
    this.provider = provider;
    this.log = log;
  }

  generateDomainFromWallet() {
    try {
      const address = this.wallet.address.toLowerCase().replace("0x", "");
      const randomChars = generateRandomChars(6);
      const last9Chars = address.slice(-9);
      const domainName = randomChars + last9Chars;
      return domainName;
    } catch (error) {
      return "backup" + Math.floor(Math.random() * 10000);
    }
  }

  generateDomainVariations() {
    const variations = [];

    for (let i = 0; i < 10; i++) {
      const baseDomain = this.generateDomainFromWallet();
      variations.push(baseDomain);
    }

    for (let i = 1; i <= 5; i++) {
      const baseDomain = this.generateDomainFromWallet();
      variations.push(baseDomain + i);
    }

    const suffixes = ["a", "b", "x", "z", "0"];
    suffixes.forEach((suffix) => {
      const baseDomain = this.generateDomainFromWallet();
      variations.push(baseDomain + suffix);
    });

    return variations;
  }

  generateSecret() {
    return "0x" + crypto.randomBytes(32).toString("hex");
  }

  async saveTxHistory(data) {
    try {
      const historyFile = path.join(__dirname, "../domains.json");
      let history = [];

      if (fs.existsSync(historyFile)) {
        const content = fs.readFileSync(historyFile, "utf8");
        history = JSON.parse(content);
      }

      history.push({
        timestamp: new Date().toISOString(),
        wallet: this.wallet.address,
        ...data,
      });

      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      this.log(`Lỗi khi lưu lịch sử giao dịch: ${error.message}`, "warning");
    }
  }

  async sendTransaction(contract, method, params, value = 0) {
    try {
      const pendingNonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
      const latestNonce = await this.provider.getTransactionCount(this.wallet.address, "latest");

      if (pendingNonce > latestNonce) {
        return {
          success: false,
          message: "There are pending transactions. Please wait for them to be completed.",
        };
      }

      let gasLimit = 500000;
      let txValue = 0n;

      if (value) {
        if (typeof value === "bigint") {
          txValue = value;
        } else if (typeof value === "object" && value.base !== undefined) {
          txValue = value.base + value.premium;
        } else {
          txValue = ethers.parseEther(value.toString());
        }
      }

      try {
        gasLimit = await contract[method].estimateGas(...params, { value: txValue });
        gasLimit = Math.ceil(Number(gasLimit) * 1.2);
      } catch (e) {
        this.log(`Ước tính gas thất bại cho ${method}, dùng mặc định: ${gasLimit}`, "warning");
      }

      const tx = await contract[method](...params, {
        gasLimit: gasLimit,
        value: txValue,
      });

      await tx.wait();

      return {
        success: true,
        txHash: tx.hash,
        message: `Mint dommain success: ${EXPLORER}${tx.hash}`,
      };
    } catch (error) {
      if (error.code === "NONCE_EXPIRED" || error.message.includes("TX_REPLAY_ATTACK")) {
        return {
          success: false,
          message: "Nonce conflict detected. Please retry the transaction.",
        };
      }
      return {
        success: false,
        message: `Mint domain faied: ${error.message}`,
      };
    }
  }

  async isNameAvailable(contract, name) {
    try {
      return await contract.available(name);
    } catch (error) {
      this.log(`Name ${name} not avaliable: ${error.message}`, "warning");
      return false;
    }
  }

  async getRentPrice(contract, name, duration) {
    try {
      return await contract.rentPrice(name, duration);
    } catch (error) {
      this.log(`Can't get price name ${name}: ${error.message}`, "warning");
      return { base: ethers.parseEther("0.01"), premium: 0n };
    }
  }

  async mintNames() {
    try {
      const registrar = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.wallet);
      const numberOfNames = getRandomNumber(settings.NUMBER_MINT_NAME[0], settings.NUMBER_MINT_NAME[1]);
      const rentYears = settings.RENT_YEARS || 1;
      const duration = rentYears * ONE_YEAR;
      const domainVariations = this.generateDomainVariations();

      let successCount = 0;
      let failCount = 0;
      let usedDomains = [];

      for (let i = 0; i < numberOfNames; i++) {
        try {
          let selectedDomain = null;

          for (const variation of domainVariations) {
            if (usedDomains.includes(variation)) {
              continue;
            }

            const isAvailable = await this.isNameAvailable(registrar, variation);
            if (isAvailable) {
              selectedDomain = variation;
              usedDomains.push(variation);
              break;
            } else {
              this.log(`Domain ${variation}.phrs not avaliable`, "warning");
            }
          }

          if (!selectedDomain) {
            failCount++;
            continue;
          }

          const label = selectedDomain;
          const fullDomain = `${selectedDomain}.phrs`;

          this.log(`[${i + 1}/${numberOfNames}] Minting domain: ${fullDomain}`, "info");

          const secret = this.generateSecret();

          const commitment = await registrar.makeCommitment(label, this.wallet.address, duration, secret, settings.RESOLVER, settings.DATA, settings.REVERSE_RECORD, settings.OWNER_CONTROLLED_FUSES);
          const commitResult = await this.sendTransaction(registrar, "commit", [commitment]);
          if (!commitResult.success) {
            this.log(`Mint domain ${selectedDomain} failed: ${commitResult.message}`, "warning");
            failCount++;
            continue;
          }

          this.log(commitResult.message, "success");

          await this.saveTxHistory({
            type: "domain_commit",
            name: fullDomain,
            txHash: commitResult.txHash,
            commitment: commitment,
          });

          let waitTime = settings.COMMIT_WAIT_SECONDS;
          try {
            const minAge = await registrar.minCommitmentAge();
            const minAgeSeconds = Number(minAge);
            waitTime = Math.max(waitTime, minAgeSeconds + 5);
            this.log(`Watting ${waitTime}s to commit domain...`, "info");
          } catch (error) {}

          this.log(`Waiting chờ ${waitTime}s to register domain...`, "info");
          await sleep(waitTime);

          const priceResult = await this.getRentPrice(registrar, label, duration);
          const totalValue = priceResult.base + priceResult.premium;
          const rentPriceEth = ethers.formatEther(totalValue);

          try {
            await registrar.register.staticCall(label, this.wallet.address, duration, secret, settings.RESOLVER, settings.DATA, settings.REVERSE_RECORD, settings.OWNER_CONTROLLED_FUSES, {
              value: totalValue,
            });
          } catch (error) {
            this.log(`Mint domain faileed: ${error.reason || error.message}`, "warning");
            failCount++;
            continue;
          }

          const registerResult = await this.sendTransaction(
            registrar,
            "register",
            [label, this.wallet.address, duration, secret, settings.RESOLVER, settings.DATA, settings.REVERSE_RECORD, settings.OWNER_CONTROLLED_FUSES],
            priceResult
          );

          if (registerResult.success) {
            this.log(registerResult.message, "success");
            successCount++;

            await this.saveTxHistory({
              type: "domain_register",
              name: fullDomain,
              txHash: registerResult.txHash,
              price: rentPriceEth,
              priceWei: totalValue.toString(),
              duration: rentYears,
            });
          } else {
            this.log(`Register domain failed ${fullDomain}: ${registerResult.message}`, "warning");
            failCount++;
          }

          if (i < numberOfNames - 1) {
            const betweenDelay = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
            this.log(`Waiting ${betweenDelay}s to next transactions...`, "info");
            await sleep(betweenDelay);
          }
        } catch (error) {
          failCount++;
        }
      }

      return {
        success: true,
        total: numberOfNames,
        successCount,
        failCount,
        message: `Mint domain success ${successCount}/${numberOfNames} domain`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Mint domain failed: ${error.message}`,
      };
    }
  }
}

module.exports = MintNameService;
