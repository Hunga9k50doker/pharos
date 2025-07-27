require("dotenv").config();
const { _isArray } = require("../utils/utils.js");

const settings = {
  TIME_SLEEP: process.env.TIME_SLEEP ? parseInt(process.env.TIME_SLEEP) : 8,
  MAX_THEADS: process.env.MAX_THEADS ? parseInt(process.env.MAX_THEADS) : 10,
  MAX_LEVEL_SPEED: process.env.MAX_LEVEL_SPEED ? parseInt(process.env.MAX_LEVEL_SPEED) : 10,
  MAX_THEADS_NO_PROXY: process.env.MAX_THEADS_NO_PROXY ? parseInt(process.env.MAX_THEADS_NO_PROXY) : 10,
  AMOUNT_REF: process.env.AMOUNT_REF ? parseInt(process.env.AMOUNT_REF) : 100,
  NUMBER_PER_REF: process.env.NUMBER_PER_REF ? parseInt(process.env.NUMBER_PER_REF) : 100,
  NUMBER_SEND: process.env.NUMBER_SEND ? parseInt(process.env.NUMBER_SEND) : 10,
  NUMBER_SWAP: process.env.NUMBER_SWAP ? parseInt(process.env.NUMBER_SWAP) : 10,
  NUMBER_ADDLP: process.env.NUMBER_ADDLP ? parseInt(process.env.NUMBER_ADDLP) : 10,
  NUMBER_MINT: process.env.NUMBER_MINT ? parseInt(process.env.NUMBER_MINT) : 1,
  RENT_YEARS: process.env.RENT_YEARS ? parseInt(process.env.RENT_YEARS) : 1,
  COMMIT_WAIT_SECONDS: process.env.COMMIT_WAIT_SECONDS ? parseInt(process.env.COMMIT_WAIT_SECONDS) : 1,

  SKIP_TASKS: process.env.SKIP_TASKS ? JSON.parse(process.env.SKIP_TASKS.replace(/'/g, '"')) : [],
  TYPE_HERO_UPGRADE: process.env.TYPE_HERO_UPGRADE ? JSON.parse(process.env.TYPE_HERO_UPGRADE.replace(/'/g, '"')) : [],
  TYPE_HERO_RESET: process.env.TYPE_HERO_RESET ? JSON.parse(process.env.TYPE_HERO_RESET.replace(/'/g, '"')) : [],
  TOKENS_FAUCET: process.env.TOKENS_FAUCET ? JSON.parse(process.env.TOKENS_FAUCET.replace(/'/g, '"')) : [],
  TASKS_ID: process.env.TASKS_ID ? JSON.parse(process.env.TASKS_ID.replace(/'/g, '"')) : [],
  LIST_NFT_MINT: process.env.LIST_NFT_MINT ? JSON.parse(process.env.LIST_NFT_MINT.replace(/'/g, '"')) : [],
  OPTIONS_SEND: process.env.OPTIONS_SEND ? JSON.parse(process.env.OPTIONS_SEND.replace(/'/g, '"')) : [],

  AUTO_TASK: process.env.AUTO_TASK ? process.env.AUTO_TASK.toLowerCase() === "true" : false,
  AUTO_CHALLENGE: process.env.AUTO_CHALLENGE ? process.env.AUTO_CHALLENGE.toLowerCase() === "true" : false,
  ENABLE_MAP_RANGE_CHALLENGE: process.env.ENABLE_MAP_RANGE_CHALLENGE ? process.env.ENABLE_MAP_RANGE_CHALLENGE.toLowerCase() === "true" : false,

  AUTO_SHOW_COUNT_DOWN_TIME_SLEEP: process.env.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP ? process.env.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP.toLowerCase() === "true" : false,
  AUTO_CLAIM_BONUS: process.env.AUTO_CLAIM_BONUS ? process.env.AUTO_CLAIM_BONUS.toLowerCase() === "true" : false,
  ENABLE_ADVANCED_MERGE: process.env.ENABLE_ADVANCED_MERGE ? process.env.ENABLE_ADVANCED_MERGE.toLowerCase() === "true" : false,
  ENABLE_DEBUG: process.env.ENABLE_DEBUG ? process.env.ENABLE_DEBUG.toLowerCase() === "true" : false,

  AUTO_UPGRADE_SPEED: process.env.AUTO_UPGRADE_SPEED ? process.env.AUTO_UPGRADE_SPEED.toLowerCase() === "true" : false,
  AUTO_BUY_PET: process.env.AUTO_BUY_PET ? process.env.AUTO_BUY_PET.toLowerCase() === "true" : false,
  AUTO_FAUCET_STABLE_COIN: process.env.AUTO_FAUCET_STABLE_COIN ? process.env.AUTO_FAUCET_STABLE_COIN.toLowerCase() === "true" : false,
  AUTO_SWAP_FAROS: process.env.AUTO_SWAP_FAROS ? process.env.AUTO_SWAP_FAROS.toLowerCase() === "true" : false,

  AUTO_ADDLP: process.env.AUTO_ADDLP ? process.env.AUTO_ADDLP.toLowerCase() === "true" : false,

  ADVANCED_ANTI_DETECTION: process.env.ADVANCED_ANTI_DETECTION ? process.env.ADVANCED_ANTI_DETECTION.toLowerCase() === "true" : false,
  AUTO_AQUAFLUX: process.env.AUTO_AQUAFLUX ? process.env.AUTO_AQUAFLUX.toLowerCase() === "true" : false,
  USE_PROXY: process.env.USE_PROXY ? process.env.USE_PROXY.toLowerCase() === "true" : false,
  AUTO_DAILY_COMBO: process.env.AUTO_DAILY_COMBO ? process.env.AUTO_DAILY_COMBO.toLowerCase() === "true" : false,
  AUTO_FAUCET: process.env.AUTO_FAUCET ? process.env.AUTO_FAUCET.toLowerCase() === "true" : false,
  AUTO_SWAP: process.env.AUTO_SWAP ? process.env.AUTO_SWAP.toLowerCase() === "true" : false,
  AUTO_SEND: process.env.AUTO_SEND ? process.env.AUTO_SEND.toLowerCase() === "true" : false,
  AUTO_MINT: process.env.AUTO_MINT ? process.env.AUTO_MINT.toLowerCase() === "true" : false,
  AUTO_MINT_BADGE_GRENDLINE: process.env.AUTO_MINT_BADGE_GRENDLINE ? process.env.AUTO_MINT_BADGE_GRENDLINE.toLowerCase() === "true" : false,
  AUTO_SEND_ALL: process.env.AUTO_SEND_ALL ? process.env.AUTO_SEND_ALL.toLowerCase() === "true" : false,
  SEND_RANDOM: process.env.SEND_RANDOM ? process.env.SEND_RANDOM.toLowerCase() === "true" : false,
  AUTO_MINT_DOMAIN: process.env.AUTO_MINT_DOMAIN ? process.env.AUTO_MINT_DOMAIN.toLowerCase() === "true" : false,

  API_ID: process.env.API_ID ? process.env.API_ID : null,
  BASE_URL: process.env.BASE_URL ? process.env.BASE_URL : null,
  BASE_URL_v2: process.env.BASE_URL_v2 ? process.env.BASE_URL_v2 : "https://testnet-router.zenithswap.xyz",
  REF_CODE: process.env.REF_CODE ? process.env.REF_CODE : "6KrCMbaT8IZqPYUm",
  RPC_URL: process.env.RPC_URL ? process.env.RPC_URL : null,
  EXPOLER: process.env.EXPOLER ? process.env.EXPOLER : null,
  CHAIN_ID: process.env.CHAIN_ID ? process.env.CHAIN_ID : 688688,

  TYPE_CAPTCHA: process.env.TYPE_CAPTCHA ? process.env.TYPE_CAPTCHA : null,
  API_KEY_2CAPTCHA: process.env.API_KEY_2CAPTCHA ? process.env.API_KEY_2CAPTCHA : null,
  API_KEY_ANTI_CAPTCHA: process.env.API_KEY_ANTI_CAPTCHA ? process.env.API_KEY_ANTI_CAPTCHA : null,
  API_KEY_CAPMONSTER: process.env.API_KEY_CAPMONSTER ? process.env.API_KEY_CAPMONSTER : null,
  CAPTCHA_URL: process.env.CAPTCHA_URL ? process.env.CAPTCHA_URL : null,
  WEBSITE_KEY: process.env.WEBSITE_KEY ? process.env.WEBSITE_KEY : null,
  DAILY_COMBO: process.env.DAILY_COMBO ? process.env.DAILY_COMBO : null,

  DELAY_BETWEEN_REQUESTS: process.env.DELAY_BETWEEN_REQUESTS && _isArray(process.env.DELAY_BETWEEN_REQUESTS) ? JSON.parse(process.env.DELAY_BETWEEN_REQUESTS) : [1, 5],
  DELAY_START_BOT: process.env.DELAY_START_BOT && _isArray(process.env.DELAY_START_BOT) ? JSON.parse(process.env.DELAY_START_BOT) : [1, 15],
  AMOUNT_ADDLP: process.env.AMOUNT_ADDLP && _isArray(process.env.AMOUNT_ADDLP) ? JSON.parse(process.env.AMOUNT_ADDLP) : [1, 15],
  AMOUNT_TAPS: process.env.AMOUNT_TAPS && _isArray(process.env.AMOUNT_TAPS) ? JSON.parse(process.env.AMOUNT_TAPS) : [10, 15],
  DELAY_TASK: process.env.DELAY_TASK && _isArray(process.env.DELAY_TASK) ? JSON.parse(process.env.DELAY_TASK) : [10, 15],
  AMOUNT_SEND: process.env.AMOUNT_SEND && _isArray(process.env.AMOUNT_SEND) ? JSON.parse(process.env.AMOUNT_SEND) : [0.1, 0.2],
  AMOUNT_SWAP: process.env.AMOUNT_SWAP && _isArray(process.env.AMOUNT_SWAP) ? JSON.parse(process.env.AMOUNT_SWAP) : [0.1, 0.2],
  NUMBER_MINT_NAME: process.env.NUMBER_MINT_NAME && _isArray(process.env.NUMBER_MINT_NAME) ? JSON.parse(process.env.NUMBER_MINT_NAME) : [1, 3],
};

module.exports = settings;
