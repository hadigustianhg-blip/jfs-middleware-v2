"use strict";

const { scrapeAgingSign } = require("../scrapers/aging-sign.scraper");
const { executeWithAuthRetry } = require("../utils/auth-retry");

function createAgingSignService({
  scrapeAgingSignFn = scrapeAgingSign,
  getAuthToken = () => process.env.AUTH_TOKEN || "",
  refreshAuth
} = {}) {
  return {
    async getAgingSign(options) {
      return executeWithAuthRetry({
        getAuthToken,
        refreshAuth,
        operation: authToken => scrapeAgingSignFn({
          ...options,
          authToken
        })
      });
    }
  };
}

module.exports = {
  createAgingSignService
};
