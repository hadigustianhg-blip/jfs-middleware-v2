"use strict";

class EmergencyTokenError extends Error {
  constructor(message, code = "JFS_EMERGENCY_TOKEN_EXPIRED", status = 401) {
    super(message);
    this.name = "EmergencyTokenError";
    this.code = code;
    this.status = status;
  }
}

function isEmergencyTokenModeActive() {
  const mode = (process.env.JFS_EMERGENCY_TOKEN_MODE || "").trim().toLowerCase();
  return mode === "true" || mode === "1";
}

function assertEmergencyTokenNotExpired() {
  const until = (process.env.JFS_EMERGENCY_TOKEN_UNTIL || "").trim();
  if (until) {
    const expiryTime = Date.parse(until);
    if (!isNaN(expiryTime) && Date.now() > expiryTime) {
      throw new EmergencyTokenError(
        "Batas waktu emergency token 7 hari telah berakhir.",
        "JFS_EMERGENCY_MODE_EXPIRED",
        401
      );
    }
  }
}

function getEmergencyToken() {
  assertEmergencyTokenNotExpired();

  const token = (process.env.JFS_AUTH_TOKEN || process.env.AUTH_TOKEN || "").trim();
  if (!token) {
    throw new EmergencyTokenError(
      "JFS Emergency Token tidak ditemukan.",
      "JFS_EMERGENCY_TOKEN_EXPIRED",
      401
    );
  }

  return token;
}

async function resolveJfsToken(fallbackFn) {
  if (isEmergencyTokenModeActive()) {
    return getEmergencyToken();
  }
  if (typeof fallbackFn === "function") {
    return fallbackFn();
  }
  return (process.env.JFS_AUTH_TOKEN || process.env.AUTH_TOKEN || "").trim();
}

module.exports = {
  EmergencyTokenError,
  assertEmergencyTokenNotExpired,
  getEmergencyToken,
  isEmergencyTokenModeActive,
  resolveJfsToken
};
