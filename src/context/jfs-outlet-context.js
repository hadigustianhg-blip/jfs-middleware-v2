"use strict";

const axios = require("axios");

class JfsAuthError extends Error {
  constructor(message = "JFS_LOGIN_FAILED: Scoped JFS login failed", metadata = {}) {
    super(message);
    this.name = "JfsAuthError";
    this.code = metadata.code || "JFS_LOGIN_FAILED";
    this.stage = "SCOPED_AUTH";
    if (typeof metadata.status === "number") {
      this.status = metadata.status;
    }
  }
}

function extractTokenFromResponse(res) {
  if (!res || !res.data) return null;
  const payload = res.data;
  if (typeof payload === "object") {
    if (typeof payload.data?.token === "string" && payload.data.token.trim().length > 0) {
      return payload.data.token.trim();
    }
    if (typeof payload.token === "string" && payload.token.trim().length > 0) {
      return payload.token.trim();
    }
    if (typeof payload.data === "string" && payload.data.trim().length > 0) {
      return payload.data.trim();
    }
  }
  return null;
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
  const deviceNo = process.env.JFS_DEVICE_NO || require("node:crypto").randomUUID();

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
          throw new JfsAuthError("JFS_LOGIN_FAILED: JFS credentials not provided for outlet", {
            code: "JFS_LOGIN_FAILED",
            status: 401
          });
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
              deviceNo,
              countryId: "1"
            }
          });

          const token = extractTokenFromResponse(res);
          const appCode = res.data?.code;
          const validAppCode = appCode === undefined || appCode === null || appCode === 0 || appCode === 1;

          if (res.status !== 200 || !validAppCode || !token) {
            const status = typeof res.status === "number" ? res.status : 401;
            const safeMsg = "JFS_LOGIN_FAILED: Scoped JFS login failed";
            lastFailure = { occurredAt: new Date(), message: safeMsg };
            throw new JfsAuthError(safeMsg, { code: "JFS_LOGIN_FAILED", status });
          }

          currentToken = token;
          lastLoginAt = new Date();
          lastFailure = null;
          return currentToken;
        } catch (err) {
          const status = typeof err.status === "number" ? err.status : (err.response?.status || 500);
          const safeError = err instanceof JfsAuthError
            ? err
            : new JfsAuthError("JFS_LOGIN_FAILED: Scoped JFS login failed", { code: "JFS_LOGIN_FAILED", status });

          lastFailure = { occurredAt: new Date(), message: safeError.message };
          throw safeError;
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
  JfsAuthError,
  createJfsOutletContext,
  extractTokenFromResponse
};
