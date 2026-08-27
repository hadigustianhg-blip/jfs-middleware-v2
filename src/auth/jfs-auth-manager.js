"use strict";

const crypto = require("node:crypto");
const { externalRequest } = require("../utils/request");

const JFS_LOGIN_URL = "https://jfsgw.jtcargo.co.id/basicdata/login";

function shortFingerprint(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 10);
}

function logLoginMetadata(stage, { account, password, deviceNo, headers, response }) {
  const payload = response?.data;
  const profile = payload?.data;
  console.info(`[JFS][LOGIN_RUNTIME] ${stage}`, {
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "unknown",
    endpointHost: "jfsgw.jtcargo.co.id",
    endpointPath: "/basicdata/login",
    method: "POST",
    headerNames: Object.keys(headers).sort(),
    userAgent: headers["User-Agent"],
    routename: headers.Routename,
    lang: headers.Lang,
    langtype: headers.Langtype,
    bodyKeyNames: ["account", "password", "captchaToken", "deviceNo", "countryId"],
    deviceFingerprint: shortFingerprint(deviceNo),
    accountFingerprint: shortFingerprint(String(account).trim()),
    passwordMode: /^[a-f0-9]{32}$/i.test(password) ? "ALREADY_MD5" : "RAW_TO_HASH",
    ...(response ? {
      httpStatus: response.status,
      appCode: payload?.code,
      succ: payload?.succ,
      fail: payload?.fail,
      tokenPresent: Boolean(profile?.token),
      networkCodePresent: Boolean(profile?.networkCode),
      responseShapeKeys: payload && typeof payload === "object" ? Object.keys(payload).sort() : [],
      profileShapeKeys: profile && typeof profile === "object" ? Object.keys(profile).sort() : []
    } : {})
  });
}

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
    Routename: "login",
    "User-Agent": "Mozilla/5.0"
  };
}

function createLoginError() {
  const error = new Error("JFS login failed");
  error.code = "JFS_LOGIN_FAILED";
  return error;
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

  try {
    const headers = buildLoginHeaders();
    const passwordHash = /^[a-f0-9]{32}$/i.test(password)
      ? password.toLowerCase()
      : hashPassword(password);
    logLoginMetadata("request", { account, password, deviceNo, headers });
    const response = await requestFn({
      method: "POST",
      url: JFS_LOGIN_URL,
      headers,
      body: {
        account: account.trim(),
        password: passwordHash,
        captchaToken: "",
        deviceNo,
        countryId: "1"
      }
    });
    logLoginMetadata("response", { account, password, deviceNo, headers, response });

    const profile = response?.data?.data;
    if (!profile?.token) {
      throw createLoginError();
    }

    return {
      token: profile.token,
      networkCode: profile.networkCode ?? "",
      name: profile.name ?? ""
    };
  } catch (error) {
    if (error.code === "JFS_LOGIN_FAILED") {
      throw error;
    }
    throw createLoginError();
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
      password: credentials.password,
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
      password
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
  hashPassword,
  performJfsLogin
};
