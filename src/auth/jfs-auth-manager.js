"use strict";

const crypto = require("node:crypto");
const { externalRequest } = require("../utils/request");

const JFS_LOGIN_URL = "https://jfsgw.jtcargo.co.id/basicdata/login";

function hashPassword(password) {
  return crypto
    .createHash("md5")
    .update(password, "utf8")
    .digest("hex")
    .toLowerCase();
}

function buildLoginHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "login",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
  };
}

function createLoginError() {
  const error = new Error("JFS login failed");
  error.code = "JFS_LOGIN_FAILED";
  return error;
}

function extractLoginProfile(response) {
  if (!response) return null;

  const data = response.data || response;
  if (!data || typeof data !== "object") return null;

  const appCode = data.code;
  const isSucc = data.succ !== false && data.fail !== true;
  const validAppCode = appCode === undefined || appCode === null || appCode === 0 || appCode === 1;

  if (!validAppCode || !isSucc) {
    return null;
  }

  const profile = data.data;
  let token = "";
  let networkCode = "";
  let name = "";

  if (profile && typeof profile === "object") {
    token = typeof profile.token === "string" ? profile.token.trim() : "";
    networkCode = typeof profile.networkCode === "string" ? profile.networkCode.trim() : (profile.networkCode ?? "");
    name = typeof profile.name === "string" ? profile.name.trim() : (profile.name ?? "");
  } else if (typeof profile === "string" && profile.trim()) {
    token = profile.trim();
  }

  if (!token && typeof data.token === "string" && data.token.trim()) {
    token = data.token.trim();
  }

  if (!token) return null;

  return { token, networkCode, name };
}

async function performJfsLogin({
  account,
  password,
  deviceNo = process.env.JFS_DEVICE_NO || crypto.randomUUID(),
  requestFn = externalRequest
} = {}) {
  if (!account || typeof account !== "string" || !account.trim() || !password || typeof password !== "string") {
    throw createLoginError();
  }

  const passwordHash = /^[a-f0-9]{32}$/i.test(password)
    ? password.toLowerCase()
    : hashPassword(password);

  try {
    const response = await requestFn({
      method: "POST",
      url: JFS_LOGIN_URL,
      headers: buildLoginHeaders(),
      body: {
        account: account.trim(),
        password: passwordHash,
        captchaToken: "",
        deviceNo,
        countryId: "1"
      }
    });

    const profile = extractLoginProfile(response);
    if (!profile || !profile.token) {
      throw createLoginError();
    }

    return profile;
  } catch (error) {
    if (error.code === "JFS_LOGIN_FAILED") {
      throw error;
    }
    const loginErr = createLoginError();
    if (typeof error.status === "number") loginErr.status = error.status;
    throw loginErr;
  }
}

function createJfsAuthManager({
  initialToken = "",
  deviceNo = process.env.JFS_DEVICE_NO || crypto.randomUUID(),
  requestFn = externalRequest,
  onToken = () => {}
} = {}) {
  let cachedToken = initialToken;
  let credentials;
  let refreshPromise;

  function setToken(token) {
    cachedToken = token || "";
    onToken(cachedToken);
  }

  async function performLogin() {
    if (!credentials) {
      throw createLoginError();
    }

    const profile = await performJfsLogin({
      account: credentials.account,
      password: credentials.passwordHash,
      deviceNo,
      requestFn
    });

    setToken(profile.token);
    return profile;
  }

  async function loginWithCredentials(account, password) {
    if (
      typeof account !== "string" ||
      !account.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      throw createLoginError();
    }

    credentials = {
      account: account.trim(),
      passwordHash: hashPassword(password)
    };
    return performLogin();
  }

  async function refreshLogin() {
    if (!refreshPromise) {
      refreshPromise = performLogin().finally(() => {
        refreshPromise = undefined;
      });
    }
    return refreshPromise;
  }

  return {
    getToken: () => cachedToken,
    hasCredentials: () => Boolean(credentials),
    loginWithCredentials,
    refreshLogin,
    setToken
  };
}

module.exports = {
  JFS_LOGIN_URL,
  buildLoginHeaders,
  createJfsAuthManager,
  extractLoginProfile,
  hashPassword,
  performJfsLogin
};
