"use strict";

const axios = require("axios");
const crypto = require("node:crypto");
const { createJfsAuthManager } = require("../auth/jfs-auth-manager");
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

  let lastLoginAt = initialToken ? new Date() : null;
  let lastFailure = null;
  let lastNetworkCode = networkCode || null;
  let lastNetworkName = null;
  const configuredDeviceNo = process.env.JFS_DEVICE_NO?.trim();
  const deviceNo = configuredDeviceNo || stableDeviceNo(tenantId, outletId);
  const axiosClient = axios.create();

  const resolvedFetcher = fetcher || (async (url, options) => {
    const response = await axiosClient({ url, ...options });
    return { status: response.status, data: response.data, headers: response.headers };
  });

  const sharedAuthManager = createJfsAuthManager({
    initialToken: initialToken || "",
    deviceNo,
    requestFn: options => resolvedFetcher(options.url, {
      method: options.method,
      headers: options.headers,
      data: options.body
    })
  });
  if (account && password) {
    sharedAuthManager.setCredentials(account, password);
    if (initialToken) sharedAuthManager.setToken(initialToken);
  }

  function applyProfile(profile) {
    lastNetworkCode = profile.networkCode || lastNetworkCode;
    lastNetworkName = profile.name || lastNetworkName;
    lastLoginAt = new Date();
    lastFailure = null;
    return profile.token;
  }

  async function captureLogin(login) {
    try {
      return applyProfile(await login());
    } catch (err) {
      lastFailure = { occurredAt: new Date(), message: err.message };
      throw err;
    }
  }

  const authManager = {
    async getAuthToken() {
      if (sharedAuthManager.getToken()) return sharedAuthManager.getToken();
      return this.refreshLogin();
    },

    async refreshLogin() {
      return captureLogin(() => sharedAuthManager.refreshLogin());
    },

    setToken(token) {
      sharedAuthManager.setToken(token);
      lastLoginAt = new Date();
    },

    clearToken() {
      sharedAuthManager.clearToken();
    },

    setCredentials(nextAccount, nextPassword) {
      sharedAuthManager.setCredentials(nextAccount, nextPassword);
    },

    async reconnect() {
      await captureLogin(() => sharedAuthManager.reconnect());
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
        hasToken: Boolean(sharedAuthManager.getToken()),
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
