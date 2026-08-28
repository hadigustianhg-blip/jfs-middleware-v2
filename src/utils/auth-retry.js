"use strict";

const {
  isEmergencyTokenModeActive,
  getEmergencyToken,
  EmergencyTokenError
} = require("./emergency-token");

function isUnauthorized(error) {
  return (
    error?.code === "UNAUTHORIZED" ||
    error?.status === 401 ||
    error?.response?.status === 401 ||
    error?.response?.data?.code === 401
  );
}

async function executeWithAuthRetry({
  getAuthToken,
  refreshAuth,
  operation
}) {
  if (isEmergencyTokenModeActive()) {
    const token = getEmergencyToken();
    try {
      return await operation(token);
    } catch (error) {
      if (isUnauthorized(error)) {
        throw new EmergencyTokenError(
          "Emergency token JFS ditolak oleh server (401).",
          "JFS_EMERGENCY_TOKEN_EXPIRED",
          401
        );
      }
      throw error;
    }
  }

  const authToken = typeof getAuthToken === "function" ? getAuthToken() : "";
  if (!authToken) {
    const error = new Error("Token kosong");
    error.code = "TOKEN_EMPTY";
    throw error;
  }

  try {
    return await operation(authToken);
  } catch (error) {
    if (!isUnauthorized(error) || typeof refreshAuth !== "function") {
      throw error;
    }

    const refreshed = await refreshAuth();
    const refreshedToken =
      typeof refreshed === "string" ? refreshed : refreshed?.token;
    if (!refreshedToken) {
      throw error;
    }
    return operation(refreshedToken);
  }
}

module.exports = {
  executeWithAuthRetry,
  isUnauthorized
};
