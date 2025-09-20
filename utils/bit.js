const ethers = require("ethers");
const { sleep, getRandomElement, getRandomNumber } = require("./utils");
const settings = require("../config/config");

class BitverseServices {
  constructor({ log, makeRequest, provider, wallet }) {
    this.wallet = wallet;
    this.provider = provider;
    this.makeRequest = makeRequest;
    this.log = log;
    this.BASE_API = "https://api.bitverse.zone/bitverse";
    this.RPC_URL = settings.RPC_URL;
    this.USDT_CONTRACT_ADDRESS = "0xD4071393f8716661958F766DF660033b3d35fD29";
    this.POSITION_ROUTER_ADDRESS = "0xA307cE75Bc6eF22794410D783e5D4265dEd1A24f";
    this.TRADE_ROUTER_ADDRESS = "0xbf428011d76eFbfaEE35a20dD6a0cA589B539c54";
    this.TRADE_PROVIDER_ADDRESS = "bvx17w0adeg64ky0daxwd2ugyuneellmjgnx53lm9l";

    this.ERC20_CONTRACT_ABI = [
      "function balanceOf(address owner) view returns (uint256)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function decimals() view returns (uint8)",
      "function deposit(address token, uint256 amount)",
      "function withdraw(address token, uint256 amount)",
    ];

    this.BITVERSE_CONTRACT_ABI = [
      {
        type: "function",
        name: "placeOrder",
        stateMutability: "nonpayable",
        inputs: [
          { internalType: "string", name: "pairId", type: "string" },
          { internalType: "uint256", name: "price", type: "uint256" },
          { internalType: "uint8", name: "orderType", type: "uint8" },
          { internalType: "uint64", name: "leverageE2", type: "uint64" },
          { internalType: "uint8", name: "side", type: "uint8" },
          { internalType: "uint64", name: "slippageE6", type: "uint64" },
          {
            type: "tuple[]",
            name: "margins",
            internalType: "struct Margin[]",
            components: [
              { internalType: "address", name: "token", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
          },
          { internalType: "uint256", name: "takeProfitPrice", type: "uint256" },
          { internalType: "uint256", name: "stopLossPrice", type: "uint256" },
          { internalType: "uint256", name: "positionLongOI", type: "uint256" },
          { internalType: "uint256", name: "positionShortOI", type: "uint256" },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
          { internalType: "bytes", name: "signature", type: "bytes" },
          { internalType: "bool", name: "isExecuteImmediately", type: "bool" },
        ],
        outputs: [],
      },
    ];
  }

  generateTradeOption() {
    const tradePair = ["BTC-USD", "ETH-USD"][Math.floor(Math.random() * 2)];
    return { tradePair, tradeSide: 1 }; // Always Long for now
  }

  generateOrderPayload(tradePair, acceptablePrice, tradeSide, tradeAmount) {
    return {
      address: this.TRADE_PROVIDER_ADDRESS,
      pair: tradePair,
      price: acceptablePrice.toString(),
      orderType: 2,
      leverageE2: 500,
      side: tradeSide,
      margin: [{ denom: "USDT", amount: Math.floor(tradeAmount).toString() }],
      allowedSlippage: "10",
      isV2: "0",
    };
  }

  async getTokenBalance(contractAddress) {
    const address = this.wallet.address;
    try {
      const provider = this.provider;
      const tokenContract = new ethers.Contract(contractAddress, this.ERC20_CONTRACT_ABI, provider);

      const [balance, decimals] = await Promise.all([tokenContract.balanceOf(address), tokenContract.decimals()]);

      return Number(ethers.formatUnits(balance, decimals));
    } catch (error) {
      return 0;
    }
  }

  async approvingToken(wallet, routerAddress, assetAddress, amount) {
    try {
      const tokenContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const allowance = await tokenContract.allowance(wallet.address, routerAddress);

      if (BigInt(allowance) < BigInt(amount)) {
        const approveTx = await tokenContract.approve(routerAddress, ethers.MaxUint256);
        await approveTx.wait();
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      return true;
    } catch (error) {
      this.log(`Approving token failed: ${error.message}`, "warning");
      return false;
    }
  }

  async performDeposit(wallet, assetAddress, amount) {
    try {
      const assetContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const decimals = await assetContract.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);

      await this.approvingToken(wallet, this.POSITION_ROUTER_ADDRESS, assetAddress, amountWei);

      const routerContract = new ethers.Contract(this.POSITION_ROUTER_ADDRESS, this.ERC20_CONTRACT_ABI, wallet);
      const tx = await routerContract.deposit(assetAddress, amountWei);

      await tx.wait();
      return tx.hash;
    } catch (error) {
      this.log(`Deposit failed: ${error.message}`, "warning");
    }
  }

  async performWithdraw(wallet, assetAddress, amount) {
    try {
      const assetContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const decimals = await assetContract.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);

      const routerContract = new ethers.Contract(this.POSITION_ROUTER_ADDRESS, this.ERC20_CONTRACT_ABI, wallet);
      const tx = await routerContract.withdraw(assetAddress, amountWei);

      await tx.wait();
      return tx.hash;
    } catch (error) {
      this.log(`Withdraw failed: ${error.message}`, "warning");
    }
  }

  async performTrade(wallet, orders, acceptablePrice, assetAddress, amount) {
    try {
      const assetContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const decimals = await assetContract.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);

      const tradeContract = new ethers.Contract(this.TRADE_ROUTER_ADDRESS, this.BITVERSE_CONTRACT_ABI, wallet);

      const params = {
        pairId: orders.result.pair,
        price: acceptablePrice,
        orderType: 2,
        leverageE2: parseInt(orders.result.leverageE2),
        side: parseInt(orders.result.side),
        slippageE6: parseInt(orders.result.allowedSlippage),
        margins: [[assetAddress, amountWei]],
        takeProfitPrice: 0,
        stopLossPrice: 0,
        positionLongOI: BigInt(orders.result.longOI),
        positionShortOI: BigInt(orders.result.shortOI),
        timestamp: parseInt(orders.result.signTimestamp),
        signature: orders.result.sign,
        isExecuteImmediately: Boolean(orders.result.marketOpening),
      };

      const tx = await tradeContract.placeOrder(
        params.pairId,
        params.price,
        params.orderType,
        params.leverageE2,
        params.side,
        params.slippageE6,
        params.margins,
        params.takeProfitPrice,
        params.stopLossPrice,
        params.positionLongOI,
        params.positionShortOI,
        params.timestamp,
        params.signature,
        params.isExecuteImmediately
      );

      await tx.wait();
      return tx.hash;
    } catch (error) {
      throw new Error(`Trade failed: ${error.message}`);
    }
  }

  async getAllBalance(address) {
    try {
      const url = `${this.BASE_API}/trade-data/v1/account/balance/allCoinBalance`;
      const response = await this.makeRequest(
        url,
        "post",
        { address: this.wallet.address },
        {
          extraHeaders: {
            "Chain-Id": "688688",
            Origin: "https://testnet.bitverse.zone",
            Referer: "https://testnet.bitverse.zone/",
            "Tenant-Id": "PHAROS",
          },
        }
      );
      return response.data;
    } catch (error) {
      this.log(`Failed to get all balances: ${error.message}`, "warning");
      return 0;
    }
  }

  async getMarketPrice(tradePair) {
    try {
      const url = `${this.BASE_API}/quote-all-in-one/v1/public/market/ticker?symbol=${tradePair}`;
      const response = await this.makeRequest(url, "get", null, {
        extraHeaders: {
          "Chain-Id": "688688",
          Origin: "https://testnet.bitverse.zone",
          Referer: "https://testnet.bitverse.zone/",
          "Tenant-Id": "PHAROS",
        },
      });
      return response.data;
    } catch (error) {
      this.log(`Failed to get market price: ${error.message}`, "warning");
      return 0;
    }
  }

  async orderSimulation(tradePair, acceptablePrice, tradeSide, tradeAmount) {
    try {
      const url = `${this.BASE_API}/trade-data/v1//order/simulation/pendingOrder`;
      const payload = this.generateOrderPayload(tradePair, acceptablePrice, tradeSide, tradeAmount);
      const response = await this.makeRequest(url, "post", payload, {
        extraHeaders: {
          "Chain-Id": "688688",
          Origin: "https://testnet.bitverse.zone",
          Referer: "https://testnet.bitverse.zone/",
          "Tenant-Id": "PHAROS",
        },
      });
      return response.data;
    } catch (error) {
      this.log(`Order simulation failed: ${error.message}`, "warning");
      return null;
    }
  }

  async handleDeposit(amount) {
    const wallet = this.wallet;
    this.log(`Processing deposit...`);
    // Check USDT balance
    const balance = await this.getTokenBalance(this.USDT_CONTRACT_ADDRESS);
    this.log(`USDT Balance: ${balance}`);

    if (balance < amount) {
      this.log(`Warning: Insufficient USDT balance`, "warning");
      return;
    }
    const txHash = await this.performDeposit(wallet, this.USDT_CONTRACT_ADDRESS, amount);
    this.log(`Success: Deposit ${amount} USDT | Confirmed: ${txHash}`, "success");
  }

  async handleWithDraw(amount) {
    const wallet = this.wallet;
    const address = wallet.address;
    const allBalance = await this.getAllBalance(address);
    if (allBalance.retCode !== 0) {
      this.log(`Error: ${allBalance.retMsg || "Failed to fetch balance"}`, "warning");
      return;
    }

    const coinBalance = allBalance.result?.coinBalance || [];
    const usdtData = coinBalance.find((coin) => coin.coinName === "USDT");
    const balance = usdtData ? parseFloat(usdtData.balanceSize) : 0;

    this.log(`Deposited USDT Balance: ${balance}`, "success");

    if (balance < amount) {
      this.log(`Warning: Insufficient deposited USDT balance`, "warning");
      return;
    }
    const txHash = await this.performWithdraw(wallet, this.USDT_CONTRACT_ADDRESS, amount);
    this.log(`Success: Withdraw ${amount} USDT | Confirmed: ${txHash}`, "success");
  }

  async handleTrade() {
    const wallet = this.wallet;
    const address = wallet.address;
    const tradeCount = getRandomNumber(settings.NUMBER_TRADE[0], settings.NUMBER_TRADE[1]);
    for (let j = 0; j < tradeCount; j++) {
      this.log(`Trade ${j + 1} of ${tradeCount}`);
      const tradeAmount = getRandomNumber(settings.AMOUNT_TRADE[0], settings.AMOUNT_TRADE[1]);
      const { tradePair, tradeSide } = this.generateTradeOption();
      const tradeOption = tradeSide === 1 ? "[Long]" : "[Short]";
      this.log(`Pair: ${tradePair} ${tradeOption} | Amount: ${tradeAmount} USDT`);

      // Check deposited balance
      const allBalance = await this.getAllBalance(address);
      if (allBalance.retCode !== 0) {
        this.log(`Error: ${allBalance.retMsg || "Failed to fetch balance"}`);
        continue;
      }

      const coinBalance = allBalance.result?.coinBalance || [];
      const usdtData = coinBalance.find((coin) => coin.coinName === "USDT");
      const balance = usdtData ? parseFloat(usdtData.balanceSize) : 0;

      this.log(`Deposited Balance: ${balance} USDT`, "success");

      if (balance < tradeAmount) {
        this.log(`Warning: Insufficient deposited USDT balance`, "warning");
        break;
      }

      // Get market price
      const markets = await this.getMarketPrice(tradePair);
      if (markets.retCode !== 0) {
        this.log(`Error: ${markets.retMsg || "Failed to fetch market price"}`);
        continue;
      }

      const marketPrice = parseFloat(markets.result.lastPrice);
      this.log(`Market Price: ${marketPrice} USDT`);

      // Calculate acceptable price with 1% slippage
      let acceptablePrice;
      if (tradeSide === 1) {
        acceptablePrice = marketPrice * 1.01;
      } else {
        acceptablePrice = marketPrice * 0.99;
      }
      const acceptablePriceWei = Math.floor(acceptablePrice * 1e6);
      // Order simulation
      const orders = await this.orderSimulation(tradePair, acceptablePriceWei, tradeSide, tradeAmount);

      if (orders.retCode !== 0) {
        this.log(`Error: ${orders.retMsg || "Order simulation failed"}`);
        continue;
      }

      // Execute trade
      const txHash = await this.performTrade(wallet, orders, acceptablePriceWei, this.USDT_CONTRACT_ADDRESS, tradeAmount);
      this.log(`Success: Trade executed | Confirmed: ${txHash}`);
      // Delay between trades
      if (j < tradeCount - 1) {
        const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
        this.log(`Waiting ${timesleep} seconds for next trade...`);
        await sleep(timesleep);
      }
    }
  }

  async performBitverseServices({ amount }) {
    this.log("Starting Bitverse Task...");
    const actions = settings.BITVERSE_OPTIONS;
    console.log(actions);
    for (const action of actions) {
      this.log(`Excute ${action}`);
      const address = this.wallet.address;
      // await provider.getTransactionCount(address, "pending");
      try {
        const wallet = this.wallet;
        if (action === "deposit") {
          await this.handleDeposit(amount);
        } else if (action === "withdraw") {
          this.log(`Processing withdraw...`);
          await this.handleWithDraw(amount);
        } else if (action === "trade") {
          this.log(`Processing trades...`);
          await this.handleTrade();
        }
      } catch (error) {
        this.log(`Error: ${error.message}`);
      }
    }
  }
}

module.exports = { BitverseServices };
