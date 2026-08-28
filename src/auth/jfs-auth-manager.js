"use strict";

const crypto = require("node:crypto");
const { externalRequest } = require("../utils/request");

const JFS_LOGIN_URL = "https://jfsgw.jtcargo.co.id/basicdata/login";

function shortFingerprint(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 10);
}

function valueMetadata(value) {
  const stringValue = typeof value === "string" ? value : String(value ?? "");
  return {
    type: typeof value,
    length: stringValue.length,
    empty: stringValue.length === 0,
    fingerprint: shortFingerprint(stringValue)
  };
}

function classifyLoginMessage(message) {
  const text = typeof message === "string" ? message.toLowerCase() : "";
  if (/captcha|verify|verification|challenge/.test(text)) return "VERIFICATION_REQUIRED";
  if (/device|terminal|equipment/.test(text)) return "DEVICE_REJECTED";
  if (/elsewhere|already.*login|session|online/.test(text)) return "SESSION_CONFLICT";
  if (/account|password|credential|user/.test(text)) return "CREDENTIAL_REJECTED";
  return text ? "OTHER_JFS_REJECTION" : "NO_MESSAGE";
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
    passwordMode: "RAW_TO_HASH",
    payloadMetadata: {
      account: valueMetadata(String(account).trim()),
      passwordBeforeHash: valueMetadata(password),
      passwordAfterHash: valueMetadata(hashPassword(password)),
      deviceNo: valueMetadata(deviceNo),
      captchaToken: valueMetadata(""),
      countryId: valueMetadata("1")
    },
    ...(response ? {
      httpStatus: response.status,
      appCode: payload?.code,
      succ: payload?.succ,
      fail: payload?.fail,
      tokenPresent: Boolean(profile?.token),
      networkCodePresent: Boolean(profile?.networkCode),
      responseShapeKeys: payload && typeof payload === "object" ? Object.keys(payload).sort() : [],
      profileShapeKeys: profile && typeof profile === "object" ? Object.keys(profile).sort() : [],
      messageClass: classifyLoginMessage(payload?.msg)
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
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "login",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
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

const JFS_DEVICE_QUERY_URL = "https://jfsgw.jtcargo.co.id/basicdata/loginDeviceApply/query";
const DEVICE_VERIFICATION_CODE = 143045003;

async function pollDeviceVerificationApproval({
  staffNo,
  deviceNo,
  requestFn = externalRequest,
  maxAttempts = 12,
  pollIntervalMs = process.env.NODE_ENV === "test" ? 1 : 3000
}) {
  const headers = buildLoginHeaders();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await requestFn({
        method: "POST",
        url: JFS_DEVICE_QUERY_URL,
        headers,
        body: {
          staffNo: String(staffNo || "").trim(),
          deviceNo: String(deviceNo || "").trim()
        }
      });

      const resData = response?.data || response;
      const status = resData?.data?.status ?? resData?.status ?? resData?.data;

      // Status: 1 = PENDING, 2 = APPROVED, 3 = REJECTED
      if (status === 2 || status === "2" || status === "APPROVED") {
        return { approved: true };
      }
      if (status === 3 || status === "3") {
        const error = new Error("Verifikasi perangkat JFS ditolak.");
        error.code = "JFS_DEVICE_VERIFICATION_REJECTED";
        error.status = 401;
        throw error;
      }
    } catch (err) {
      if (err.code === "JFS_DEVICE_VERIFICATION_REJECTED") throw err;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  const error = new Error("Batas waktu verifikasi perangkat JFS telah habis. Silakan setujui verifikasi di aplikasi JFS lalu coba lagi.");
  error.code = "JFS_DEVICE_VERIFICATION_TIMEOUT";
  error.status = 401;
  throw error;
}

async function performJfsLogin({
  account,
  password,
  deviceNo = process.env.JFS_DEVICE_NO || crypto.randomUUID(),
  feiShuCode,
  feiShuState,
  requestFn = externalRequest,
  isRetryAfterVerification = false
} = {}) {
  if (!account || typeof account !== "string" || !account.trim() || !password || typeof password !== "string") {
    throw createLoginError();
  }

  try {
    const headers = buildLoginHeaders();
    const passwordHash = hashPassword(password);
    logLoginMetadata("request", { account, password, deviceNo, headers });

    const body = {
      account: account.trim(),
      password: passwordHash,
      captchaToken: "",
      deviceNo,
      countryId: "1"
    };

    if (feiShuCode && typeof feiShuCode === "string" && feiShuCode.trim()) {
      body.feiShuCode = feiShuCode.trim();
    }
    if (feiShuState && typeof feiShuState === "string" && feiShuState.trim()) {
      body.feiShuState = feiShuState.trim();
    }

    const response = await requestFn({
      method: "POST",
      url: JFS_LOGIN_URL,
      headers,
      body
    });
    logLoginMetadata("response", { account, password, deviceNo, headers, response });

    const resData = response?.data || response;
    const code = resData?.code ?? resData?.data?.code ?? response?.code;

    // Handle Device Verification Required (appCode 143045003)
    if ((code === DEVICE_VERIFICATION_CODE || Number(code) === 143045003 || String(code) === "143045003") && !isRetryAfterVerification) {
      const staffNo = resData?.data?.staffNo || resData?.staffNo || account.trim();

      await pollDeviceVerificationApproval({
        staffNo,
        deviceNo,
        requestFn,
        maxAttempts: 12,
        pollIntervalMs: process.env.NODE_ENV === "test" ? 1 : 3000
      });

      return performJfsLogin({
        account,
        password,
        deviceNo,
        feiShuCode,
        feiShuState,
        requestFn,
        isRetryAfterVerification: true
      });
    }

    const profile = extractLoginProfile(response);
    if (!profile || !profile.token) {
      const loginErr = createLoginError();
      if (resData?.msg) {
        loginErr.message = resData.msg;
      }
      throw loginErr;
    }

    return profile;
  } catch (error) {
    if (
      error.code === "JFS_LOGIN_FAILED" ||
      error.code === "JFS_DEVICE_VERIFICATION_REJECTED" ||
      error.code === "JFS_DEVICE_VERIFICATION_TIMEOUT"
    ) {
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
  let credentialGeneration = 0;

  function setToken(token) {
    cachedToken = token || "";
    onToken(cachedToken);
  }

  async function performLogin() {
    if (!credentials) {
      throw createLoginError();
    }

    const loginGeneration = credentialGeneration;
    const profile = await performJfsLogin({
      account: credentials.account,
      password: credentials.password,
      deviceNo,
      requestFn
    });

    if (loginGeneration !== credentialGeneration) {
      const error = new Error("JFS credentials changed during login");
      error.code = "JFS_STALE_CREDENTIAL_LOGIN";
      throw error;
    }

    setToken(profile.token);
    return profile;
  }

  function setCredentials(account, password) {
    if (
      typeof account !== "string" ||
      !account.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      throw createLoginError();
    }

    credentials = { account: account.trim(), password };
    credentialGeneration += 1;
    setToken("");
    refreshPromise = undefined;
  }

  async function loginWithCredentials(account, password) {
    setCredentials(account, password);
    return performLogin();
  }

  async function refreshLogin() {
    if (!refreshPromise) {
      const activeRefresh = performLogin().finally(() => {
        if (refreshPromise === activeRefresh) refreshPromise = undefined;
      });
      refreshPromise = activeRefresh;
    }
    return refreshPromise;
  }

  return {
    getToken: () => cachedToken,
    hasCredentials: () => Boolean(credentials),
    clearToken: () => setToken(""),
    loginWithCredentials,
    refreshLogin,
    reconnect: async () => {
      setToken("");
      return performLogin();
    },
    setCredentials,
    setToken
  };
}

module.exports = {
  JFS_LOGIN_URL,
  JFS_DEVICE_QUERY_URL,
  DEVICE_VERIFICATION_CODE,
  buildLoginHeaders,
  createJfsAuthManager,
  extractLoginProfile,
  hashPassword,
  performJfsLogin,
  pollDeviceVerificationApproval
};
