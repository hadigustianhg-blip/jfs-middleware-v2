"use strict";

const {
  scrapeSensitiveDetail
} = require("../scrapers/sensitive.scraper");
const { executeWithAuthRetry } = require("../utils/auth-retry");

function createSensitiveService({
  scrapeSensitiveDetailFn = scrapeSensitiveDetail,
  getAuthToken = () => process.env.AUTH_TOKEN || "",
  refreshAuth
} = {}) {
  return {
    async getSensitiveDetail(options) {
      return executeWithAuthRetry({
        getAuthToken,
        refreshAuth,
        operation: authToken => scrapeSensitiveDetailFn({
          ...options,
          authToken
        })
      });
    }
  };
}

module.exports = {
  createSensitiveService
};
