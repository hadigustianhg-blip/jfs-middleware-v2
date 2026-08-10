"use strict";

const axios = require("axios");

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

  const resolvedFetcher = fetcher || (async (url, options) => {
    const response = await axios({ url, ...options });
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
        if (!account || !password) {
          throw new Error(`JFS credentials not provided for outlet ${outletCode}`);
        }

        try {
          const loginUrl = `${jfsBaseUrl}/basicdata/login`;
          const passwordHash = /^[a-f0-9]{32}$/i.test(password)
            ? password.toLowerCase()
            : require("node:crypto").createHash("md5").update(password, "utf8").digest("hex").toLowerCase();
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
              account,
              password: passwordHash,
              captchaToken: "",
              deviceNo: require("node:crypto").randomUUID(),
              countryId: "1"
            }
          });

          if (res.status !== 200 || !res.data || res.data.code !== 0 || !res.data.data?.token) {
            const errMessage = res.data?.msg || `JFS login failed with status ${res.status}`;
            lastFailure = { occurredAt: new Date(), message: errMessage };
            throw new Error(`JFS_LOGIN_FAILED: ${errMessage}`);
          }

          currentToken = res.data.data.token;
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
    httpClient,
    getState() {
      return {
        tenantId,
        outletId,
        outletCode,
        networkCode: networkCode || outletCode,
        hasToken: Boolean(currentToken),
        lastLoginAt,
        lastFailure
      };
    }
  };
}

module.exports = {
  createJfsOutletContext
};
