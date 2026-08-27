"use strict";

const axios = require("axios");
const crypto = require("node:crypto");
const { externalRequest } = require("../utils/request");

const DEVICE_NAMESPACE = "nextgen:jfs:scoped-device:v1";

function stableDeviceNo(tenantId, outletId, provider = "JFS") {
  const digest = crypto.createHash("sha256")
    .update(`${DEVICE_NAMESPACE}:${tenantId}:${outletId}:${provider}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function createJfsOutletContext({
  tenantId,
  outletId,
  outletCode,
  networkCode,
  financeCode = "BDO000",
  financeId = 183,
  scanSiteCode = outletCode,
  account,
  password,
  initialToken = null,
  jfsBaseUrl = "https://jfsgw.jtcargo.co.id",
  fetcher = null
}) {
  if (!tenantId || !outletId || !outletCode) {
    throw new TypeError("tenantId, outletId, and outletCode are required for JfsOutletContext");
  }

  let currentToken = initialToken;
  let lastLoginAt = initialToken ? new Date() : null;
  let lastFailure = null;
  let refreshPromise = null;
  let scopedAccount = account;
  let scopedPassword = password;
  let lastNetworkCode = networkCode || null;
  let lastNetworkName = null;
  const deviceNo = stableDeviceNo(tenantId, outletId);
  const axiosClient = axios.create();

  const resolvedFetcher = fetcher || (async (url, options) => {
    const response = await axiosClient({ url, ...options });
    return { status: response.status, data: response.data, headers: response.headers };
  });

  const authManager = {
    async getAuthToken() {
      if (currentToken) return currentToken;
      return this.refreshLogin();
    },

    async refreshLogin() {
      if (refreshPromise) return refreshPromise;

      refreshPromise = (async () => {
        if (!scopedAccount || !scopedPassword) {
          throw new Error(`JFS credentials not provided for outlet ${outletCode}`);
        }

        try {
          const loginUrl = `${jfsBaseUrl}/basicdata/login`;
          const passwordHash = /^[a-f0-9]{32}$/i.test(scopedPassword)
            ? scopedPassword.toLowerCase()
            : crypto.createHash("md5").update(scopedPassword, "utf8").digest("hex").toLowerCase();
          const res = await resolvedFetcher(loginUrl, {
            method: "POST",
            headers: {
              "Accept": "application/json, text/plain, */*",
              "Content-Type": "application/json;charset=UTF-8",
              "Lang": "ID",
              "Langtype": "ID",
              "Routename": "login",
              "User-Agent": "Mozilla/5.0"
            },
            data: {
              account: scopedAccount,
              password: passwordHash,
              captchaToken: "",
              deviceNo,
              countryId: "1"
            }
          });

          const token = res.data?.data?.token;
          const validToken = typeof token === "string" && token.trim().length > 0;
          if (res.status !== 200 || !validToken) {
            const errMessage = res.data?.msg || `JFS login failed with status ${res.status}`;
            lastFailure = { occurredAt: new Date(), message: errMessage };
            throw new Error(`JFS_LOGIN_FAILED: ${errMessage}`);
          }

          currentToken = token;
          lastNetworkCode = typeof res.data?.data?.networkCode === "string"
            ? res.data.data.networkCode.trim()
            : lastNetworkCode;
          lastNetworkName = typeof res.data?.data?.name === "string"
            ? res.data.data.name.trim()
            : lastNetworkName;
          lastLoginAt = new Date();
          lastFailure = null;
          return currentToken;
        } catch (err) {
          lastFailure = { occurredAt: new Date(), message: err.message };
          throw err;
        }
      })();

      try {
        return await refreshPromise;
      } finally {
        refreshPromise = null;
      }
    },

    setToken(token) {
      currentToken = token;
      lastLoginAt = new Date();
    },

    clearToken() {
      currentToken = null;
    },

    setCredentials(nextAccount, nextPassword) {
      if (!nextAccount || !nextPassword) throw new Error("JFS credentials are required");
      scopedAccount = String(nextAccount).trim();
      scopedPassword = String(nextPassword);
      currentToken = null;
    },

    async reconnect() {
      currentToken = null;
      await this.refreshLogin();
      return { connected: true, networkCode: lastNetworkCode, name: lastNetworkName, sessionStatus: "ACTIVE" };
    },

    async testConnection() {
      await this.getAuthToken();
      return { connected: true, networkCode: lastNetworkCode, name: lastNetworkName, sessionStatus: "ACTIVE" };
    }
  };

  const httpClient = {
    async request(config) {
      let token = await authManager.getAuthToken();
      const headers = {
        ...(config.headers || {}),
        authorization: token
      };

      try {
        const res = await resolvedFetcher(config.url, {
          ...config,
          headers
        });

        if (res.status === 401 || (res.data && res.data.code === 401)) {
          authManager.clearToken();
          token = await authManager.refreshLogin();
          const retryHeaders = {
            ...(config.headers || {}),
            authorization: token
          };
          return await resolvedFetcher(config.url, {
            ...config,
            headers: retryHeaders
          });
        }

        return res;
      } catch (err) {
        if (err.response?.status === 401) {
          authManager.clearToken();
          token = await authManager.refreshLogin();
          const retryHeaders = {
            ...(config.headers || {}),
            authorization: token
          };
          return await resolvedFetcher(config.url, {
            ...config,
            headers: retryHeaders
          });
        }
        throw err;
      }
    }
  };

  return {
    tenantId,
    outletId,
    outletCode,
    networkCode: networkCode || outletCode,
    config: {
      networkCode: networkCode || outletCode,
      financeCode,
      financeId,
      scanSiteCode: scanSiteCode || outletCode,
      jfsBaseUrl
    },
    authManager,
    axiosClient,
    deviceNo,
    request: options => externalRequest({ ...options, axiosInstance: axiosClient }),
    httpClient,
    getState() {
      return {
        tenantId,
        outletId,
        outletCode,
        networkCode: networkCode || outletCode,
        hasToken: Boolean(currentToken),
        networkCode: lastNetworkCode,
        lastLoginAt,
        lastFailure
      };
    }
  };
}

module.exports = {
  createJfsOutletContext,
  stableDeviceNo
};
