"use strict";

const axios = require("axios");
const { installAxiosAuthRetry } = require("../auth/axios-auth-retry");

/**
 * Creates an isolated Axios HTTP client instance per outlet context.
 * Does NOT affect global axios.
 */
function createJfsHttpClient(options = {}) {
  const { authManager, baseURL, timeout = 30000 } = options;

  const instance = axios.create({
    baseURL,
    timeout
  });

  if (authManager && typeof authManager.hasCredentials === "function") {
    installAxiosAuthRetry(instance, authManager);
  }

  return instance;
}

module.exports = {
  createJfsHttpClient
};
