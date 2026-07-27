"use strict";

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
  const authToken = getAuthToken();
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
