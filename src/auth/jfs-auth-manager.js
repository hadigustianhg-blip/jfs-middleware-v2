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
    "User-Agent": "Mozilla/5.0"
  };
}

function createLoginError() {
  const error = new Error("JFS login failed");
  error.code = "JFS_LOGIN_FAILED";
  return error;
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

    try {
      const response = await requestFn({
        method: "POST",
        url: JFS_LOGIN_URL,
        headers: buildLoginHeaders(),
        body: {
          account: credentials.account,
          password: credentials.passwordHash,
          captchaToken: "",
          deviceNo,
          countryId: "1"
        }
      });
      const profile = response?.data?.data;

      if (!profile?.token) {
        throw createLoginError();
      }

      setToken(profile.token);
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
  hashPassword
};
