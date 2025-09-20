const { ethers } = require("ethers");
const axios = require("axios").default;
const FakeUserAgent = require("fake-user-agent");
const chalk = require("chalk");
const moment = require("moment-timezone");
const fs = require("fs").promises;
const path = require("path");

const wib = "Asia/Jakarta";

class Spout {
  constructor() {
    this.BASE_API = "https://www.spout.finance/api";
    this.RPC_URL = "https://testnet.dplabs-internal.com/";
    this.ZERO_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
    this.USDC_CONTRACT_ADDRESS = "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED";
    this.SLQD_CONTRACT_ADDRESS = "0x54b753555853ce22f66Ac8cB8e324EB607C4e4eE";
    this.GATEWAY_ROUTER_ADDRESS = "0x126F0c11F3e5EafE37AB143D4AA688429ef7DCB3";
    this.FACTORY_ROUTER_ADDRESS = "0x18cB5F2774a80121d1067007933285B32516226a";
    this.ISSUER_ROUTER_ADDRESS = "0xA5C77b623BEB3bC0071fA568de99e15Ccc06C7cb";
    this.ORDERS_ROUTER_ADDRESS = "0x81b33972f8bdf14fD7968aC99CAc59BcaB7f4E9A";
    this.ERC20_CONTRACT_ABI = [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "address", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
      {
        type: "function",
        name: "allowance",
        stateMutability: "view",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
      },
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
      {
        type: "function",
        name: "decimals",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
      },
    ];
    this.SPOUT_CONTRACT_ABI = [
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
    this.proxies = [];
    this.proxy_index = 0;
    this.account_proxies = {};
    this.used_nonce = {};
    this.identity_address = {};
    this.trade_count = 0;
    this.usdc_amount = 0;
    this.min_delay = 0;
    this.max_delay = 0;
  }

  clearTerminal() {
    console.clear();
  }

  log(message) {
    console.log(`${chalk.cyanBright(`[ ${moment().tz(wib).format("MM/DD/YY HH:mm:ss Z")} ]`)}${chalk.whiteBright(" | ")}${message}`);
  }

  welcome() {
    console.log(`${chalk.greenBright("Spout Finance")} ${chalk.blueBright("Auto BOT")}\n` + `${chalk.greenBright("Rey?")} ${chalk.yellowBright("<INI WATERMARK>")}`);
  }

  formatSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  async loadProxies() {
    const filename = "proxy.txt";
    try {
      if (
        !(await fs
          .access(filename)
          .then(() => true)
          .catch(() => false))
      ) {
        this.log(`${chalk.redBright(`File ${filename} Not Found.`)}`);
        return;
      }
      const data = await fs.readFile(filename, "utf8");
      this.proxies = data
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);
      if (!this.proxies.length) {
        this.log(`${chalk.redBright("No Proxies Found.")}`);
        return;
      }
      this.log(`${chalk.greenBright("Proxies Total  : ")}${chalk.whiteBright(this.proxies.length)}`);
    } catch (e) {
      this.log(`${chalk.redBright(`Failed To Load Proxies: ${e.message}`)}`);
      this.proxies = [];
    }
  }

  checkProxySchemes(proxies) {
    const schemes = ["http://", "https://", "socks4://", "socks5://"];
    if (schemes.some((scheme) => proxies.startsWith(scheme))) {
      return proxies;
    }
    return `http://${proxies}`;
  }

  getNextProxyForAccount(token) {
    if (!(token in this.account_proxies)) {
      if (!this.proxies.length) return null;
      const proxy = this.checkProxySchemes(this.proxies[this.proxy_index]);
      this.account_proxies[token] = proxy;
      this.proxy_index = (this.proxy_index + 1) % this.proxies.length;
    }
    return this.account_proxies[token];
  }

  rotateProxyForAccount(token) {
    if (!this.proxies.length) return null;
    const proxy = this.checkProxySchemes(this.proxies[this.proxy_index]);
    this.account_proxies[token] = proxy;
    this.proxy_index = (this.proxy_index + 1) % this.proxies.length;
    return proxy;
  }

  generateAddress(privateKey) {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return wallet.address;
    } catch (e) {
      return null;
    }
  }

  maskAccount(account) {
    try {
      return account.slice(0, 6) + "******" + account.slice(-6);
    } catch (e) {
      return null;
    }
  }

  async getWeb3WithCheck(address, useProxy, retries = 3, timeout = 60) {
    const requestOptions = { timeout: timeout * 1000 };
    const proxy = useProxy ? this.getNextProxyForAccount(address) : null;
    if (useProxy && proxy) {
      requestOptions.agent = new (require("https-proxy-agent"))(proxy);
    }
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const provider = new ethers.JsonRpcProvider(this.RPC_URL);
        await provider.getBlockNumber();
        return provider;
      } catch (e) {
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }
        throw new Error(`Failed to Connect to RPC: ${e.message}`);
      }
    }
  }

  async getTokenBalance(address, contractAddress, useProxy) {
    try {
      const provider = await this.getWeb3WithCheck(address, useProxy);
      const contract = new ethers.Contract(contractAddress, this.ERC20_CONTRACT_ABI, provider);
      const balance = await contract.balanceOf(address);
      const decimals = await contract.decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (e) {
      this.log(`${chalk.cyanBright("   Message :")}${chalk.redBright(` ${e.message} `)}`);
      return null;
    }
  }

  async getIdentityAddress(address, useProxy) {
    try {
      const provider = await this.getWeb3WithCheck(address, useProxy);
      const contract = new ethers.Contract(this.FACTORY_ROUTER_ADDRESS, this.SPOUT_CONTRACT_ABI, provider);
      const identityAddress = await contract.getIdentity(address);
      return identityAddress;
    } catch (e) {
      this.log(`${chalk.cyanBright("   Message :")}${chalk.redBright(` ${e.message} `)}`);
      return null;
    }
  }

  async getClaimIds(address, useProxy) {
    try {
      const provider = await this.getWeb3WithCheck(address, useProxy);
      const contract = new ethers.Contract(this.identity_address[address], this.SPOUT_CONTRACT_ABI, provider);
      const claimIds = await contract.getClaimIdsByTopic(1);
      return claimIds;
    } catch (e) {
      this.log(`${chalk.cyanBright("   Message :")}${chalk.redBright(` ${e.message} `)}`);
      return null;
    }
  }

  async sendRawTransactionWithRetries(wallet, provider, tx, retries = 5) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const signedTx = await wallet.signTransaction(tx);
        const txHash = await provider.sendTransaction(signedTx).then((tx) => tx.hash);
        return txHash;
      } catch (e) {
        if (e.code === "TRANSACTION_NOT_FOUND") {
          // Handle specific error if needed
        }
        this.log(`${chalk.cyanBright("   Message :")}${chalk.yellowBright(` [Attempt ${attempt + 1}] Send TX Error: ${e.message} `)}`);
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    throw new Error("Transaction Hash Not Found After Maximum Retries");
  }

  async waitForReceiptWithRetries(provider, txHash, retries = 5) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const receipt = await provider.waitForTransaction(txHash, 1, 300000);
        return receipt;
      } catch (e) {
        if (e.code === "TRANSACTION_NOT_FOUND") {
          // Handle specific error if needed
        }
        this.log(`${chalk.cyanBright("   Message :")}${chalk.yellowBright(` [Attempt ${attempt + 1}] Wait for Receipt Error: ${e.message} `)}`);
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    throw new Error("Transaction Receipt Not Found After Maximum Retries");
  }

  async performDeployIdentity(privateKey, address, useProxy) {
    try {
      const provider = await this.getWeb3WithCheck(address, useProxy);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(this.GATEWAY_ROUTER_ADDRESS, this.SPOUT_CONTRACT_ABI, wallet);

      const deployData = contract.interface.encodeFunctionData("deployIdentityForWallet", [address]);
      const identityAddress = await contract.getIdentity(address); // Call to get return value
      const estimatedGas = await contract.deployIdentityForWallet.estimateGas(address);

      const maxPriorityFee = ethers.parseUnits("1", "gwei");
      const maxFee = maxPriorityFee;

      const tx = {
        to: this.GATEWAY_ROUTER_ADDRESS,
        data: deployData,
        gasLimit: Math.floor(Number(estimatedGas) * 1.2),
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPriorityFee,
        nonce: this.used_nonce[address],
        chainId: (await provider.getNetwork()).chainId,
      };

      const txHash = await this.sendRawTransactionWithRetries(wallet, provider, tx);
      const receipt = await this.waitForReceiptWithRetries(provider, txHash);

      const blockNumber = receipt.blockNumber;
      this.used_nonce[address] += 1;

      return [txHash, blockNumber, identityAddress];
    } catch (e) {
      this.log(`${chalk.cyanBright("   Message :")}${chalk.redBright(` ${e.message} `)}`);
      return [null, null, null];
    }
  }

  async performAddClaim(privateKey, address, signature, useProxy) {
    try {
      const provider = await this.getWeb3WithCheck(address, useProxy);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(this.identity_address[address], this.SPOUT_CONTRACT_ABI, wallet);

      // Replaced hexDataSlice with direct hex string usage
      const data = "0x6fdd523c9e64db4a7a67716a6b20d5da5ce39e3ee59b2ca281248b18087e860";

      const addClaimData = contract.interface.encodeFunctionData("addClaim", [
        1,
        1,
        this.ISSUER_ROUTER_ADDRESS,
        signature,
        ethers.getBytes(data), // Convert hex string to bytes
        "",
      ]);

      const claimId = await contract.addClaim.staticCall(1, 1, this.ISSUER_ROUTER_ADDRESS, signature, ethers.getBytes(data), "");
      const estimatedGas = await contract.addClaim.estimateGas(1, 1, this.ISSUER_ROUTER_ADDRESS, signature, ethers.getBytes(data), "");

      const maxPriorityFee = ethers.parseUnits("1", "gwei");
      const maxFee = maxPriorityFee;

      const tx = {
        to: this.identity_address[address],
        data: addClaimData,
        gasLimit: Math.floor(Number(estimatedGas) * 1.2),
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPriorityFee,
        nonce: this.used_nonce[address],
        chainId: (await provider.getNetwork()).chainId,
      };

      const txHash = await this.sendRawTransactionWithRetries(wallet, provider, tx);
      const receipt = await this.waitForReceiptWithRetries(provider, txHash);

      const blockNumber = receipt.blockNumber;
      this.used_nonce[address] += 1;

      return [txHash, blockNumber, ethers.toBeHex(claimId)];
    } catch (e) {
      this.log(`${chalk.cyanBright("   Message :")}${chalk.redBright(` ${e.message} `)}`);
      return [null, null, null];
    }
  }

  async approvingToken(privateKey, address, routerAddress, assetAddress, amount, useProxy) {
    try {
      const provider = await this.getWeb3WithCheck(address, useProxy);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);

      const allowance = await contract.allowance(address, routerAddress);
      if (allowance < amount) {
        const approveData = contract.interface.encodeFunctionData("approve", [routerAddress, amount]);
        const estimatedGas = await contract.approve.estimateGas(routerAddress, amount);

        const maxPriorityFee = ethers.parseUnits("1", "gwei");
        const maxFee = maxPriorityFee;

        const tx = {
          to: assetAddress,
          data: approveData,
          gasLimit: Math.floor(Number(estimatedGas) * 1.2),
          maxFeePerGas: maxFee,
          maxPriorityFeePerGas: maxPriorityFee,
          nonce: this.used_nonce[address],
          chainId: (await provider.getNetwork()).chainId,
        };

        const txHash = await this.sendRawTransactionWithRetries(wallet, provider, tx);
        const receipt = await this.waitForReceiptWithRetries(provider, txHash);

        const blockNumber = receipt.blockNumber;
        this.used_nonce[address] += 1;

        const explorer = `https://testnet.pharosscan.xyz/tx/${txHash}`;
        this.log(`${chalk.cyanBright("   Approve :")}${chalk.greenBright(" Success ")}`);
        this.log(`${chalk.cyanBright("   Block   :")}${chalk.whiteBright(` ${blockNumber} `)}`);
        this.log(`${chalk.cyanBright("   Tx Hash :")}${chalk.whiteBright(` ${txHash} `)}`);
        this.log(`${chalk.cyanBright("   Explorer:")}${chalk.whiteBright(` ${explorer} `)}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      return true;
    } catch (e) {
      throw new Error(`Approving Token Contract Failed: ${e.message}`);
    }
  }

  async performBuyAsset(privateKey, address, useProxy) {
    try {
      const provider = await this.getWeb3WithCheck(address, useProxy);
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(this.ORDERS_ROUTER_ADDRESS, this.SPOUT_CONTRACT_ABI, wallet);

      const amountToWei = ethers.parseUnits(this.usdc_amount.toString(), 6);

      await this.approvingToken(privateKey, address, this.ORDERS_ROUTER_ADDRESS, this.USDC_CONTRACT_ADDRESS, amountToWei, useProxy);

      const buyData = contract.interface.encodeFunctionData("buyAsset", [2000002, "LQD", this.SLQD_CONTRACT_ADDRESS, amountToWei]);
      const estimatedGas = await contract.buyAsset.estimateGas(2000002, "LQD", this.SLQD_CONTRACT_ADDRESS, amountToWei);

      const maxPriorityFee = ethers.parseUnits("1", "gwei");
      const maxFee = maxPriorityFee;

      const tx = {
        to: this.ORDERS_ROUTER_ADDRESS,
        data: buyData,
        gasLimit: Math.floor(Number(estimatedGas) * 1.2),
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPriorityFee,
        nonce: this.used_nonce[address],
        chainId: (await provider.getNetwork()).chainId,
      };

      const txHash = await this.sendRawTransactionWithRetries(wallet, provider, tx);
      const receipt = await this.waitForReceiptWithRetries(provider, txHash);

      const blockNumber = receipt.blockNumber;
      this.used_nonce[address] += 1;

      return [txHash, blockNumber];
    } catch (e) {
      this.log(`${chalk.cyanBright("   Message :")}${chalk.redBright(` ${e.message} `)}`);
      return [null, null];
    }
  }

  async printTimer() {
    const delay = Math.floor(Math.random() * (this.max_delay - this.min_delay + 1)) + this.min_delay;
    for (let remaining = delay; remaining > 0; remaining--) {
      process.stdout.write(
        `${chalk.cyanBright(`[ ${moment().tz(wib).format("MM/DD/YY HH:mm:ss Z")} ]`)}${chalk.whiteBright(" | ")}${chalk.blueBright("Wait For")}${chalk.whiteBright(` ${remaining} `)}${chalk.blueBright(
          "Seconds For Next Tx..."
        )}\r`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  printBuyAssetQuestion() {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      const ask = () => {
        readline.question(`${chalk.yellowBright("Enter Trade Count -> ")}`, (tradeCount) => {
          try {
            tradeCount = parseInt(tradeCount.trim());
            if (tradeCount > 0) {
              this.trade_count = tradeCount;
              readline.close();
              resolve();
            } else {
              console.log(`${chalk.redBright("Trade Count must be greater than 0.")}`);
              ask();
            }
          } catch (e) {
            console.log(`${chalk.redBright("Invalid input. Enter a number.")}`);
            ask();
          }
        });
      };
      ask();
    });
  }

  printUsdcQuestion() {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      const ask = () => {
        readline.question(`${chalk.yellowBright("Enter USDC Amount -> ")}`, (usdcAmount) => {
          try {
            usdcAmount = parseFloat(usdcAmount.trim());
            if (usdcAmount > 0) {
              this.usdc_amount = usdcAmount;
              readline.close();
              resolve();
            } else {
              console.log(`${chalk.redBright("Amount must be greater than 0.")}`);
              ask();
            }
          } catch (e) {
            console.log(`${chalk.redBright("Invalid input. Enter a float or decimal number.")}`);
            ask();
          }
        });
      };
      ask();
    });
  }

  printDelayQuestion() {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      const askMin = () => {
        readline.question(`${chalk.yellowBright("Min Delay Each Tx -> ")}`, (minDelay) => {
          try {
            minDelay = parseInt(minDelay.trim());
            if (minDelay >= 0) {
              this.min_delay = minDelay;
              askMax();
            } else {
              console.log(`${chalk.redBright("Min Delay must be >= 0.")}`);
              askMin();
            }
          } catch (e) {
            console.log(`${chalk.redBright("Invalid input. Enter a number.")}`);
            askMin();
          }
        });
      };
      const askMax = () => {
        readline.question(`${chalk.yellowBright("Max Delay Each Tx -> ")}`, (maxDelay) => {
          try {
            maxDelay = parseInt(maxDelay.trim());
            if (maxDelay >= minDelay) {
              this.max_delay = maxDelay;
              readline.close();
              resolve();
            } else {
              console.log(`${chalk.redBright("Max Delay must be >= Min Delay.")}`);
              askMax();
            }
          } catch (e) {
            console.log(`${chalk.redBright("Invalid input. Enter a number.")}`);
            askMax();
          }
        });
      };
      askMin();
    });
  }

  async printQuestion() {
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let proxyChoice, rotateProxy;
    await new Promise((resolve) => {
      const askProxy = () => {
        console.log(`${chalk.whiteBright("1. Run With Proxy")}`);
        console.log(`${chalk.whiteBright("2. Run Without Proxy")}`);
        readline.question(`${chalk.blueBright("Choose [1/2] -> ")}`, (choice) => {
          try {
            proxyChoice = parseInt(choice.trim());
            if (proxyChoice === 1 || proxyChoice === 2) {
              console.log(`${chalk.greenBright(`Run ${proxyChoice === 1 ? "With" : "Without"} Proxy Selected.`)}`);
              if (proxyChoice === 1) {
                askRotate();
              } else {
                rotateProxy = false;
                readline.close();
                resolve();
              }
            } else {
              console.log(`${chalk.redBright("Please enter either 1 or 2.")}`);
              askProxy();
            }
          } catch (e) {
            console.log(`${chalk.redBright("Invalid input. Enter a number (1 or 2).")}`);
            askProxy();
          }
        });
      };
      const askRotate = () => {
        readline.question(`${chalk.blueBright("Rotate Invalid Proxy? [y/n] -> ")}`, (rotate) => {
          if (rotate.trim().toLowerCase() === "y" || rotate.trim().toLowerCase() === "n") {
            rotateProxy = rotate.trim().toLowerCase() === "y";
            readline.close();
            resolve();
          } else {
            console.log(`${chalk.redBright("Invalid input. Enter 'y' or 'n'.")}`);
            askRotate();
          }
        });
      };
      askProxy();
    });
    return [proxyChoice, rotateProxy];
  }

  async checkConnection(proxyUrl = null) {
    const url = "https://api.ipify.org?format=json";
    try {
      const config = { timeout: 30000 };
      if (proxyUrl) {
        config.proxy = { protocol: proxyUrl.split("://")[0], host: proxyUrl.split("://")[1].split(":")[0], port: parseInt(proxyUrl.split("://")[1].split(":")[1] || 80) };
      }
      const response = await axios.get(url, config);
      return response.status === 200;
    } catch (e) {
      this.log(`${chalk.cyanBright("Status  :")}${chalk.redBright(" Connection Not 200 OK ")}${chalk.magentaBright("-")}${chalk.yellowBright(` ${e.message} `)}`);
      return null;
    }
  }

  async kycSignature(address, proxyUrl = null, retries = 5) {
    const url = `${this.BASE_API}/kyc-signature`;
    const data = {
      userAddress: address,
      onchainIDAddress: this.identity_address[address],
      claimData: "KYC passed",
      topic: 1,
      countryCode: 91,
    };
    const headers = {
      Accept: "*/*",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "Content-Type": "application/json",
      Origin: "https://www.spout.finance",
      Referer: "https://www.spout.finance/app/profile?tab=kyc",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": new FakeUserAgent().random,
    };
    await new Promise((resolve) => setTimeout(resolve, 3000));
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const config = { headers, timeout: 60000 };
        if (proxyUrl) {
          config.proxy = { protocol: proxyUrl.split("://")[0], host: proxyUrl.split("://")[1].split(":")[0], port: parseInt(proxyUrl.split("://")[1].split(":")[1] || 80) };
        }
        const response = await axios.post(url, data, config);
        return response.data;
      } catch (e) {
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        this.log(`${chalk.cyanBright("   Status  :")}${chalk.redBright(" Fetch Signature Data Failed ")}${chalk.magentaBright("-")}${chalk.yellowBright(` ${e.message} `)}`);
        return null;
      }
    }
  }

  async processCheckConnection(address, useProxy, rotateProxy) {
    while (true) {
      const proxy = useProxy ? this.getNextProxyForAccount(address) : null;
      this.log(`${chalk.cyanBright("Proxy   :")}${chalk.whiteBright(` ${proxy || "None"} `)}`);
      const isValid = await this.checkConnection(proxy);
      if (!isValid) {
        if (rotateProxy) {
          this.rotateProxyForAccount(address);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        return false;
      }
      return true;
    }
  }

  async processPerformDeployIdentity(privateKey, address, useProxy) {
    const [txHash, blockNumber, identityAddress] = await this.performDeployIdentity(privateKey, address, useProxy);
    if (txHash && blockNumber && identityAddress) {
      const explorer = `https://testnet.pharosscan.xyz/tx/${txHash}`;
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.greenBright(" Success ")}`);
      this.log(`${chalk.cyanBright("   Block   :")}${chalk.whiteBright(` ${blockNumber} `)}`);
      this.log(`${chalk.cyanBright("   Tx Hash :")}${chalk.whiteBright(` ${txHash} `)}`);
      this.log(`${chalk.cyanBright("   Explorer:")}${chalk.whiteBright(` ${explorer} `)}`);
      return identityAddress;
    } else {
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.redBright(" Perform On-Chain Failed ")}`);
      return false;
    }
  }

  async processPerformAddClaim(privateKey, address, signature, useProxy) {
    const [txHash, blockNumber, claimId] = await this.performAddClaim(privateKey, address, signature, useProxy);
    if (txHash && blockNumber && claimId) {
      const explorer = `https://testnet.pharosscan.xyz/tx/${txHash}`;
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.greenBright(" Success ")}`);
      this.log(`${chalk.cyanBright("   Block   :")}${chalk.whiteBright(` ${blockNumber} `)}`);
      this.log(`${chalk.cyanBright("   Tx Hash :")}${chalk.whiteBright(` ${txHash} `)}`);
      this.log(`${chalk.cyanBright("   Explorer:")}${chalk.whiteBright(` ${explorer} `)}`);
      return claimId;
    } else {
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.redBright(" Perform On-Chain Failed ")}`);
      return false;
    }
  }

  async processPerformBuyAsset(privateKey, address, useProxy) {
    const [txHash, blockNumber] = await this.performBuyAsset(privateKey, address, useProxy);
    if (txHash && blockNumber) {
      const explorer = `https://testnet.pharosscan.xyz/tx/${txHash}`;
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.greenBright(" Success ")}`);
      this.log(`${chalk.cyanBright("   Block   :")}${chalk.whiteBright(` ${blockNumber} `)}`);
      this.log(`${chalk.cyanBright("   Tx Hash :")}${chalk.whiteBright(` ${txHash} `)}`);
      this.log(`${chalk.cyanBright("   Explorer:")}${chalk.whiteBright(` ${explorer} `)}`);
    } else {
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.redBright(" Perform On-Chain Failed ")}`);
    }
  }

  async processCompleteKyc(privateKey, address, useProxy) {
    this.log(`${chalk.cyanBright("KYC     :")}`);
    this.log(`${chalk.magentaBright(" ● ")}${chalk.greenBright("Create Onchain Id")}`);

    let identityAddress = await this.getIdentityAddress(address, useProxy);
    if (identityAddress === null) return false;

    if (identityAddress === this.ZERO_CONTRACT_ADDRESS) {
      identityAddress = await this.processPerformDeployIdentity(privateKey, address, useProxy);
      if (!identityAddress) return false;
    } else {
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.yellowBright(" Already Created ")}`);
    }

    this.log(`${chalk.cyanBright("   Identity:")}${chalk.blueBright(` ${identityAddress} `)}`);
    this.identity_address[address] = identityAddress;

    this.log(`${chalk.magentaBright(" ● ")}${chalk.greenBright("Verification With Signature")}`);

    let claimIds = await this.getClaimIds(address, useProxy);
    if (claimIds === null) return false;

    let claimId;
    if (claimIds.length === 0) {
      const proxyUrl = useProxy ? this.getNextProxyForAccount(address) : null;
      const sign = await this.kycSignature(address, proxyUrl);
      if (!sign) return false;

      const r = BigInt(sign.signature.r);
      const s = BigInt(sign.signature.s);
      const v = sign.signature.v;

      // Construct signature bytes
      const rBytes = ethers.getBytes(ethers.toBeHex(r, 32));
      const sBytes = ethers.getBytes(ethers.toBeHex(s, 32));
      const vBytes = ethers.getBytes(ethers.toBeHex(v, 1));
      const signature = ethers.concat([rBytes, sBytes, vBytes]);

      claimId = await this.processPerformAddClaim(privateKey, address, signature, useProxy);
      if (!claimId) return false;
    } else {
      claimId = ethers.toBeHex(claimIds[0]);
      this.log(`${chalk.cyanBright("   Status  :")}${chalk.yellowBright(" Already Verified ")}`);
    }

    this.log(`${chalk.cyanBright("   Claim Id:")}${chalk.blueBright(` ${claimId} `)}`);
    return true;
  }

  async processTradeBuyAsset(privateKey, address, useProxy) {
    this.log(`${chalk.magentaBright(" ● ")}${chalk.greenBright("Buy Asset")}`);

    for (let i = 0; i < this.trade_count; i++) {
      this.log(`${chalk.greenBright(" ● ")}${chalk.blueBright("Buy")}${chalk.whiteBright(` ${i + 1} `)}${chalk.magentaBright("Of")}${chalk.whiteBright(` ${this.trade_count} `)}`);
      this.log(`${chalk.cyanBright("   Pair    :")}${chalk.blueBright(" USDC to SLQD ")}`);
      this.log(`${chalk.cyanBright("   Amount  :")}${chalk.whiteBright(` ${this.usdc_amount} `)}`);

      const balance = await this.getTokenBalance(address, this.USDC_CONTRACT_ADDRESS, useProxy);
      this.log(`${chalk.cyanBright("   Balance :")}${chalk.whiteBright(` ${balance} USDC `)}`);

      if (balance === null) {
        this.log(`${chalk.cyanBright("   Status  :")}${chalk.redBright(" Fetch USDC Token Balance Failed ")}`);
        continue;
      }

      if (parseFloat(balance) < this.usdc_amount) {
        this.log(`${chalk.cyanBright("   Status  :")}${chalk.yellowBright(" Insufficient USDC Token Balance ")}`);
        return;
      }

      await this.processPerformBuyAsset(privateKey, address, useProxy);
      await this.printTimer();
    }
  }

  async processAccounts(privateKey, address, useProxy, rotateProxy) {
    const isValid = await this.processCheckConnection(address, useProxy, rotateProxy);
    if (isValid) {
      try {
        const provider = await this.getWeb3WithCheck(address, useProxy);
        this.used_nonce[address] = await provider.getTransactionCount(address, "pending");
        const isVerified = await this.processCompleteKyc(privateKey, address, useProxy);
        if (isVerified) {
          await this.processTradeBuyAsset(privateKey, address, useProxy);
        }
      } catch (e) {
        this.log(`${chalk.cyanBright("Status  :")}${chalk.redBright(" Web3 Not Connected ")}${chalk.magentaBright("-")}${chalk.yellowBright(` ${e.message} `)}`);
      }
    }
  }

  async main() {
    try {
      const accounts = (await fs.readFile("accounts.txt", "utf8"))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);

      const [proxyChoice, rotateProxy] = await this.printQuestion();
      const useProxy = proxyChoice === 1;

      while (true) {
        this.clearTerminal();
        this.welcome();
        this.log(`${chalk.greenBright("Account's Total: ")}${chalk.whiteBright(accounts.length)}`);

        if (useProxy) {
          await this.loadProxies();
        }

        const separator = "=".repeat(25);
        for (const account of accounts) {
          if (account) {
            const address = this.generateAddress(account);
            this.log(`${chalk.cyanBright(separator + "[")}${chalk.whiteBright(` ${this.maskAccount(address)} `)}${chalk.cyanBright("]" + separator)}`);

            if (!address) {
              this.log(`${chalk.cyanBright("Status  :")}${chalk.redBright(" Invalid Private Key or Library Version Not Supported ")}`);
              continue;
            }

            await this.processAccounts(account, address, useProxy, rotateProxy);
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }

        this.log(`${chalk.cyanBright("=").repeat(72)}`);
        let seconds = 24 * 60 * 60;
        while (seconds > 0) {
          const formattedTime = this.formatSeconds(seconds);
          process.stdout.write(`${chalk.cyanBright(`[ Wait for${chalk.whiteBright(` ${formattedTime} `)}... ]`)}${chalk.whiteBright(" | ")}${chalk.blueBright("All Accounts Have Been Processed.")}\r`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          seconds -= 1;
        }
      }
    } catch (e) {
      if (e.code === "ENOENT") {
        this.log(`${chalk.redBright("File 'accounts.txt' Not Found.")}`);
      } else {
        this.log(`${chalk.redBright(`Error: ${e.message}`)}`);
        throw e;
      }
    }
  }
}

async function run() {
  try {
    const bot = new Spout();
    await bot.main();
  } catch (e) {
    if (e.message.includes("SIGINT")) {
      console.log(`${chalk.cyanBright(`[ ${moment().tz(wib).format("MM/DD/YY HH:mm:ss Z")} ]`)}${chalk.whiteBright(" | ")}${chalk.redBright("[ EXIT ] Spout Finance - BOT")}`);
    } else {
      throw e;
    }
  }
}

run();
