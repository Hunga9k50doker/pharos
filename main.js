const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config.js");
const { sleep, loadData, getRandomNumber, isTokenExpired, saveJson, getRandomElement } = require("./utils/utils.js");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { checkBaseUrl } = require("./utils/checkAPI");
const { headers } = require("./core/header.js");
const { showBanner } = require("./core/banner.js");
const localStorage = require("./localStorage.json");
const ethers = require("ethers");
const { solveCaptcha } = require("./utils/captcha.js");
const { checkBalance } = require("./utils/contract.js");
const wallets = loadData("wallets.txt");
const usernameXs = loadData("usernameXs.txt");

const AddLpService = require("./utils/liqulity.js");
const TransferService = require("./utils/transfer.js");
const MintService = require("./utils/mint.js");
const SwapService = require("./utils/swap.js");
const MintNameService = require("./utils/mint.domain.js");
const AquaFluxService = require("./utils/aquaflux.js");

// const querystring = require("querystring");
class ClientAPI {
  constructor(itemData, accountIndex, proxy, baseURL) {
    this.headers = headers;
    this.baseURL = baseURL;
    this.baseURL_v2 = settings.BASE_URL_v2;
    this.localItem = null;
    this.itemData = itemData;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.token = null;
    this.localStorage = localStorage;
    this.provider = new ethers.JsonRpcProvider(settings.RPC_URL, {
      chainId: Number(settings.CHAIN_ID),
      name: "Pharos Testnet",
    });
    this.wallet = new ethers.Wallet(this.itemData.privateKey, this.provider);
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      this.session_name = this.itemData.address;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Can't create user agent: ${error.message}`, "error");
      return;
    }
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Pharos][${this.accountIndex + 1}][${this.itemData.address}]`;
    let ipPrefix = "[Local IP]";
    if (settings.USE_PROXY) {
      ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    }
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(
    url,
    method,
    data = {},
    options = {
      retries: 2,
      isAuth: false,
      extraHeaders: {},
      refreshToken: null,
    }
  ) {
    const initOptions = {
      retries: 2,
      isAuth: false,
      extraHeaders: {},
      refreshToken: null,
      ...options,
    };
    const { retries, isAuth, extraHeaders, refreshToken } = initOptions;

    const headers = {
      ...this.headers,
      ...(isAuth || !this.token ? {} : { authorization: `Bearer ${this.token}` }),
      ...extraHeaders,
    };

    let proxyAgent = null;
    if (settings.USE_PROXY) {
      proxyAgent = new HttpsProxyAgent(this.proxy);
    }

    let currRetries = 0,
      errorMessage = "",
      errorStatus = 0;

    do {
      try {
        const response = await axios({
          method,
          url: `${url}`,
          headers,
          timeout: 120000,
          ...(proxyAgent ? { httpsAgent: proxyAgent, httpAgent: proxyAgent } : {}),
          ...(method.toLowerCase() !== "get" ? { data: data } : {}),
        });
        if (response?.data?.data) return { status: response.status, success: true, data: response.data.data };
        return { success: true, data: response.data, status: response.status };
      } catch (error) {
        errorMessage = error?.response?.data?.error || error.message;
        errorStatus = error.status;
        this.log(`Request failed: ${url} | ${JSON.stringify(errorMessage)}...`, "warning");

        if (error.status === 401) {
          const token = await this.getValidToken(true);
          if (!token) {
            return { success: false, data: null, error: "UnAuth", status: 401 };
          }
          this.token = token;
          return this.makeRequest(url, method, data, options);
        }
        if (error.status === 400) {
          this.log(`Invalid request for ${url}, maybe have new update from server | contact: https://t.me/airdrophuntersieutoc to get new update!`, "error");
          return { success: false, status: error.status, error: errorMessage, data: null };
        }
        if (error.status === 429) {
          this.log(`Rate limit ${error.message}, waiting 30s to retries`, "warning");
          await sleep(60);
        }
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        currRetries++;
        if (currRetries > retries) {
          return { status: error.status, success: false, error: errorMessage, data: null };
        }
      }
      await sleep(5);
    } while (currRetries <= retries);

    return { status: errorStatus, success: false, error: errorMessage, data: null };
  }

  getCookieData(setCookie) {
    try {
      if (!(setCookie?.length > 0)) return null;
      let cookie = [];
      const item = JSON.stringify(setCookie);
      // const item =
      const nonceMatch = item.match(/user=([^;]+)/);
      if (nonceMatch && nonceMatch[0]) {
        cookie.push(nonceMatch[0]);
      }

      const data = cookie.join(";");
      return cookie.length > 0 ? data : null;
    } catch (error) {
      this.log(`Error get cookie: ${error.message}`, "error");
      return null;
    }
  }

  async auth() {
    const time = new Date().toISOString();
    const mess = `testnet.pharosnetwork.xyz wants you to sign in with your Ethereum account:
${this.itemData.address}

I accept the Pharos Terms of Service: testnet.pharosnetwork.xyz/privacy-policy/Pharos-PrivacyPolicy.pdf

URI: https://testnet.pharosnetwork.xyz

Version: 1

Chain ID: 688688

Nonce: 555

Issued At: ${time}`;

    const signedMessage = await this.wallet.signMessage(mess);
    const payload = {
      address: this.itemData.address,
      signature: signedMessage,
      wallet: "MetaMask",
      nonce: "555",
      chain_id: "688688",
      timestamp: time,
      domain: "testnet.pharosnetwork.xyz",
      invite_code: settings.REF_CODE,
    };

    return this.makeRequest(`${this.baseURL}/user/login`, "post", payload, { isAuth: true });
  }

  async getUserData() {
    return this.makeRequest(`${this.baseURL}/user/profile?address=${this.itemData.address}`, "get");
  }

  async getCheckinStatus() {
    return this.makeRequest(`${this.baseURL}/sign/status?address=${this.itemData.address}`, "get");
  }
  async checkin() {
    return this.makeRequest(`${this.baseURL}/sign/in`, "post", {
      address: this.itemData.address,
    });
  }

  async verifyTask(id) {
    return this.makeRequest(`${this.baseURL}/task/verify`, "post", {
      address: address,
      task_id: id,
    });
  }

  async verifyTaskWithHash({ address, taskId, txHash }) {
    const verifyUrl = `${this.baseURL}/task/verify`;
    return this.makeRequest(
      verifyUrl,
      "post",
      {
        address: address,
        task_id: 103,
        tx_hash: txHash,
      },
      {
        extraHeaders: {
          Accept: "application/json, text/plain, */*",
        },
      }
    );
  }

  async getTaskCompleted() {
    return this.makeRequest(`${this.baseURL}/user/tasks?address=${this.itemData.address}`, "get");
  }

  async followX() {
    return this.makeRequest(`${this.baseURL}/account/followTwitter`, "post");
  }

  async getFaucetStatus() {
    return this.makeRequest(`${this.baseURL}/faucet/status?address=${this.itemData.address}`, "get");
  }

  async faucet() {
    // this.log(`Solving captcha...`);
    // const captchaToken = await solveCaptcha();
    // if (!captchaToken) {
    //   return { success: false };
    // }
    return this.makeRequest(`${this.baseURL}/faucet/daily?address=${this.itemData.address}`, "post");
  }

  async faucetTokens(payload) {
    return this.makeRequest(`${this.baseURL_v2}/api/v1/faucet`, "post", payload, {
      extraHeaders: {
        Origin: "https://testnet.zenithswap.xyz",
        referer: "https://testnet.zenithswap.xyz/",
      },
    });
  }

  async getValidToken(isNew = false) {
    const existingToken = this.token;
    const { isExpired: isExp, expirationDate } = isTokenExpired(existingToken);

    this.log(`Access token status: ${isExp ? "Expired".yellow : "Valid".green} | Acess token exp: ${expirationDate}`);
    if (existingToken && !isNew && !isExp) {
      this.log("Using valid token", "success");
      return existingToken;
    }

    this.log("No found token or experied, trying get new token...", "warning");
    const loginRes = await this.auth();
    if (!loginRes.success) {
      this.log(`Auth failed: ${JSON.stringify(loginRes)}`, "error");
      return null;
    }
    const newToken = loginRes.data;
    if (newToken?.jwt) {
      await saveJson(this.session_name, JSON.stringify(newToken), "localStorage.json");
      return newToken.jwt;
    }
    this.log("Can't get new token...", "warning");
    return null;
  }

  async handleFaucet(userData) {
    if (settings.AUTO_FAUCET_STABLE_COIN) {
      const token = getRandomElement(settings.TOKENS_FAUCET);
      this.log(`Solving captcha...`);
      const captchaToken = await solveCaptcha({
        websiteKey: "0x4AAAAAABesmP1SWw2G_ear",
        websiteURL: "https://testnet.zenithswap.xyz/faucet",
      });
      if (!captchaToken) {
        this.log(`Can't get captcha token...`, "warning");
      } else {
        this.log(`Fauceting ${token}...`);
        const res = await this.faucetTokens({
          // tokenAddress: TOKEN_ADDRESSES[token],
          // userAddress: this.itemData.address,
          CFTurnstileResponse: captchaToken,
        });
        if (res.success && res.data?.txHash) {
          this.log(`Faucet ${token} success!`, "success");
        } else {
          this.log(`Faucet ${token} failed: ${JSON.stringify(res)}`, "warning");
        }
      }
    }

    if (settings.AUTO_FAUCET) {
      const XId = userData.user_info.XId;
      if (!XId) return this.log(`You need bind X/twitter to faucet!`, "warning");
      const resGet = await this.getFaucetStatus();
      if (resGet.data?.is_able_to_faucet) {
        const res = await this.faucet();
        if (res.success) {
          this.log(`Faucet success!`, "success");
        } else {
          this.log(`Faucet failed: ${JSON.stringify(res)}`, "warning");
        }
      } else {
        if (resGet.data?.avaliable_timestamp) {
          this.log(`Next Faucet: ${new Date(resGet.data?.avaliable_timestamp * 1000).toLocaleString()}`, "warning");
        } else {
          this.log(`Unavaliable Faucet: ${JSON.stringify(resGet)}`, "warning");
        }
      }
    }
  }

  checkInStatus(checkInArray) {
    const today = new Date();
    const dayOfWeek = today.getUTCDay();

    const index = (dayOfWeek + 6) % 7;

    const status = checkInArray[index];

    let result,
      isCheckInAvaliable = false;
    if (status === "0") {
      result = "Hôm nay đã check in.";
    } else if (status === "1") {
      result = "Hôm nay đã bị bỏ qua.";
    } else if (status === "2") {
      result = "Hôm nay chưa check in.";
      isCheckInAvaliable = true;
    } else {
      result = "Trạng thái không hợp lệ.";
    }

    return {
      day: index + 1, // Bắt đầu từ 1 đến 7
      status: result,
      isCheckInAvaliable,
    };
  }

  async handleCheckin() {
    const resGt = await this.getCheckinStatus();
    if (!resGt.success) return;
    const status = resGt.data.status || "2222222";
    const res = this.checkInStatus(status);
    if (res.isCheckInAvaliable) {
      const resCheckin = await this.checkin();
      if (resCheckin.success) {
        this.log(`Checkin success!`, "success");
      } else {
        this.log(`Failed checkin ${JSON.stringify(resCheckin)}`, "warning");
      }
      return;
    } else {
      return this.log(`You checked in today!`, "warning");
    }
  }

  async handleSyncData() {
    this.log(`Sync data...`);
    let userData = { success: false, data: null, status: 0 },
      retries = 0;

    do {
      userData = await this.getUserData();
      if (userData?.success) break;
      retries++;
    } while (retries < 1 && userData.status !== 400);
    const WPHRS_ADDRESS = "0x76aaada469d23216be5f7c596fa25f282ff9b364";
    const USDC_ADDRESS = "0x72df0bcd7276f2dfbac900d1ce63c272c4bccced";
    const USDT_ADDRESS = "0xd4071393f8716661958f766df660033b3d35fd29";
    const prams = {
      provider: this.provider,
      wallet: this.wallet,
      privateKey: this.itemData.privateKey,
    };
    const phrs = await checkBalance(prams);
    const WPHRS = await checkBalance({ ...prams, address: WPHRS_ADDRESS });
    const USDC = await checkBalance({ ...prams, address: USDC_ADDRESS });
    const USDT = await checkBalance({ ...prams, address: USDT_ADDRESS });

    if (userData?.success) {
      userData["phrs"] = phrs;

      const { TotalPoints, XId, DiscordId, InviteCode } = userData.data.user_info;
      this.log(`Ref code: ${InviteCode} | PHRS: ${phrs} | WPHRS: ${WPHRS} | USDT: ${USDT} | USDC: ${USDC} | Total points: ${TotalPoints || 0}`, "custom");
    } else {
      this.log("Can't sync new data...skipping", "warning");
    }
    return userData;
  }

  async handleverifyTask(userData) {
    const XId = userData.user_info.XId;
    if (!XId) return this.log(`You need bind X/twitter to do task!`, "warning");
    try {
      let tasks = settings.TASKS_ID;
      const tasksCompleted = await this.getTaskCompleted();
      if (!tasksCompleted.success) return;
      tasks = settings.TASKS_ID.filter((id) => !tasksCompleted.data.user_tasks.find(id));

      for (const task of tasks) {
        const res = await this.verifyTask(task);
        if (res.success) {
          this.log(`Verify task ${task} success!`, "success");
        } else {
          this.log(`Verify task ${task} failed!`, "warning");
        }
      }
    } catch (error) {
      this.log(`handle task failed! ${error.message}`, "warning");
    }
  }

  async handleverifyTaskWithHash(prs) {
    const { address, taskId, txHash } = prs;
    await sleep(10);
    try {
      const res = await this.verifyTaskWithHash(prs);
      if (res.success) {
        this.log(`Verify task ${taskId} (Tx: ${txHash}) success!`, "success");
      } else {
        this.log(`Verify task ${taskId} (Tx: ${txHash}) failed! | ${JSON.stringify(res)}`, "warning");
      }
    } catch (error) {
      this.log(`handle onchain task failed! ${error.message}`, "warning");
    }
  }

  async connectRPC() {
    this.provider = new ethers.JsonRpcProvider(settings.RPC_URL, {
      fetch: (url, options) => {
        if (settings.USE_PROXY) options.agent = new HttpsProxyAgent(this.proxy);
        return fetch(url, options);
      },
      chainId: Number(settings.CHAIN_ID),
      name: "Pharos Testnet",
    });
    this.wallet = new ethers.Wallet(this.itemData.privateKey, this.provider);
  }
  async handleOnchain() {
    const prams = {
      privateKey: this.itemData.privateKey,
      wallet: this.wallet,
      provider: this.provider,
      log: (mess, type) => this.log(mess, type),
      makeRequest: (url, method, data, options) => this.makeRequest(url, method, data, options),
    };

    if (settings.AUTO_SEND_ALL) {
      const transferService = new TransferService(prams);
      const recipientAddress = getRandomElement(wallets);
      if (recipientAddress && recipientAddress !== this.wallet.address) {
        this.log(`Sending 90% PHRS to ${recipientAddress}`);
        try {
          const resSend = await transferService.sendAllToken({ recipientAddress });
          if (resSend.success) {
            this.log(resSend.message, "success");
            await this.handleverifyTaskWithHash({ address: this.itemData.address, taskId: 103, txHash: resSend.tx });
          } else {
            this.log(resSend.message, "warning");
          }
        } catch (error) {
          this.log(`Err send token: ${error.message}`, "warning");
        }
      }
    }

    if (settings.AUTO_SEND) {
      const transferService = new TransferService(prams);
      let limit = settings.NUMBER_SEND;
      if (!settings.SEND_RANDOM) {
        limit = wallets.length;
      }
      let current = limit;
      while (current > 0) {
        let recipientAddress = wallets[limit - current];
        if (settings.SEND_RANDOM) {
          recipientAddress = getRandomElement(wallets);
        }
        if (!recipientAddress) return;
        if (recipientAddress !== this.wallet.address) {
          const option = getRandomElement(settings.OPTIONS_SEND);
          let amount = getRandomNumber(settings.AMOUNT_SEND[0], settings.AMOUNT_SEND[1], 4);
          try {
            let resSend = null;
            if (option == "twitter") {
              let xUsername = getRandomElement(usernameXs) || "@cbcrypto007";
              xUsername.startsWith("@") ? usernameXs : `@${usernameXs}`;
              this.log(`[${current}/${limit}] Sending ${amount} PHRS to ${xUsername}`);
              resSend = await transferService.sendTokenToX({ recipient: xUsername, amount });
            } else {
              this.log(`[${current}/${limit}] Sending ${amount} PHRS to ${recipientAddress}`);
              resSend = await transferService.sendToken({ recipientAddress, amount });
            }

            if (resSend.success) {
              this.log(resSend.message, "success");
              await this.handleverifyTaskWithHash({ address: this.itemData.address, taskId: 103, txHash: resSend.tx });
            } else {
              this.log(resSend.message, "warning");
              if (resSend?.stop) {
                break;
              }
            }
          } catch (error) {
            this.log(`Err send token: ${error.message}`, "warning");
          }
        }
        current--;
        if (current > 0) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          this.log(`Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
    }

    if (settings.AUTO_AQUAFLUX) {
      const aquaFluxService = new AquaFluxService(prams);
      const res = await aquaFluxService.executeAquaFluxFlow();
    }

    if (settings.AUTO_MINT_DOMAIN) {
      this.log(`Starting mint domain...`, "info");
      const mintDomainService = new MintNameService(prams);
      const res = await mintDomainService.mintNames();
    }

    //mint
    if (settings.AUTO_MINT) {
      const mintService = new MintService(prams);
      let limit = settings.NUMBER_MINT;
      let current = limit;

      for (const nft of settings.LIST_NFT_MINT) {
        if (nft !== "gotchip") {
          current = 1;
          limit = 1;
        }
        while (current > 0) {
          this.log(`[${current}/${limit}] Minting ${nft} NFT...`);
          try {
            let result = null;
            if (nft == "gotchip") {
              result = await mintService.mintGotChip();
            } else if (nft == "grandline") {
              result = await mintService.mintGrandline();
            } else if (nft == "pharos_badge") {
              result = await mintService.mintPharosBadge();
            } else if (nft == "faros_badge") {
              result = await mintService.mintFarosBadge();
            } else if (nft == "zentra") {
              result = await mintService.mintZentra();
            }
            if (result.success) {
              this.log(result.message, "success");
            } else {
              this.log(result.message, "warning");
              if (result?.stop) {
                break;
              }
            }
          } catch (error) {
            this.log(`Err mint: ${error.message}`, "warning");
          }
          current--;
          if (current > 0) {
            const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
            this.log(`Delay ${timesleep}s to next transaction...`);
            await sleep(timesleep);
          }
        }
      }
    }

    //swap
    if (settings.AUTO_SWAP) {
      const sw = new SwapService({ ...prams, log: (mess, type) => this.log(mess, type) });
      let limit = settings.NUMBER_SWAP;
      let current = limit;
      while (current > 0) {
        let amount = getRandomNumber(settings.AMOUNT_SWAP[0], settings.AMOUNT_SWAP[1], 6);
        try {
          const result = await sw.swapToken({ ...prams, amount });

          if (result.success) {
            this.log(result.message, "success");
            // await this.handleverifyTaskWithHash({ address: this.itemData.address, taskId: 101, txHash: result.tx });
          } else {
            this.log(result.message, "warning");
            if (result?.stop) {
              break;
            }
          }
        } catch (error) {
          this.log(`Err swap token: ${error.message}`, "warning");
        }
        current--;
        if (current > 0) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          this.log(`[${current}/${limit}] Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
    }

    // liqulity pool
    if (settings.AUTO_ADDLP) {
      this.log(`Starting add liquidity pool...`);
      const prsLP = {
        ...prams,
      };
      const addlp = new AddLpService({ ...prams, log: (mess, type) => this.log(mess, type) });

      try {
        const result = await addlp.performMultipleLPs(prsLP);
        // const result = await addlp.addLiquidity(prsLP);

        // if (result && result?.length > 0) {
        //   for (const tx of result) {
        //     await sleep(3);
        //     await this.handleverifyTaskWithHash({ address: this.itemData.address, taskId: 102, txHash: tx });
        //   }
        // }
      } catch (error) {
        this.log(`Err add liquility: ${error.message}`, "warning");
      }
    }
  }

  async runAccount() {
    const accountIndex = this.accountIndex;
    this.session_name = this.itemData.address;
    this.localItem = JSON.parse(this.localStorage[this.session_name] || "{}");
    this.token = this.localItem?.jwt;
    this.#set_headers();
    if (settings.USE_PROXY) {
      try {
        this.proxyIP = await this.checkProxyIP();
      } catch (error) {
        this.log(`Cannot check proxy IP: ${error.message}`, "error");
        return;
      }
    }
    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Tài khoản ${accountIndex + 1} | ${this.proxyIP || "Local IP"} | Bắt đầu sau ${timesleep} giây...`.green);
    await sleep(timesleep);

    const token = await this.getValidToken();
    if (!token) return;
    this.token = token;
    await this.connectRPC();
    const userData = await this.handleSyncData();
    if (userData?.success) {
      await this.handleFaucet(userData.data);
      await sleep(1);
      await this.handleCheckin();
      await sleep(1);
      await this.handleverifyTask(userData.data);
      await sleep(1);
      await this.handleOnchain();
    } else {
      return this.log("Can't get use info...skipping", "error");
    }
  }
}

async function runWorker(workerData) {
  const { itemData, accountIndex, proxy, hasIDAPI } = workerData;
  const to = new ClientAPI(itemData, accountIndex, proxy, hasIDAPI);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  console.clear();
  showBanner();
  const privateKeys = loadData("privateKeys.txt");
  const proxies = loadData("proxy.txt");

  if (privateKeys.length == 0 || (privateKeys.length > proxies.length && settings.USE_PROXY)) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${privateKeys.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  if (!settings.USE_PROXY) {
    console.log(`You are running bot without proxies!!!`.yellow);
  }
  let maxThreads = settings.USE_PROXY ? settings.MAX_THEADS : settings.MAX_THEADS_NO_PROXY;

  const resCheck = await checkBaseUrl();
  if (!resCheck.endpoint) return console.log(`Không thể tìm thấy ID API, có thể lỗi kết nỗi, thử lại sau!`.red);
  console.log(`${resCheck.message}`.yellow);

  console.log(`Initing data...`.blue);
  const data = privateKeys.map((val, index) => {
    const prvk = val.startsWith("0x") ? val : `0x${val}`;
    const wallet = new ethers.Wallet(prvk);
    const item = {
      address: wallet.address,
      privateKey: prvk,
    };
    new ClientAPI(item, index, proxies[index], resCheck.endpoint, {}).createUserAgent();
    return item;
  });
  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];
    while (currentIndex < data.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, data.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            hasIDAPI: resCheck.endpoint,
            itemData: data[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              if (settings.ENABLE_DEBUG) {
                console.log(message);
              }
              resolve();
            });
            worker.on("error", (error) => {
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
              }
              resolve();
            });
          })
        );
        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }
    }

    await sleep(3);
    console.log(`=============${new Date().toLocaleString()} | Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    showBanner();
    await sleep(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
