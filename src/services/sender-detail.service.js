"use strict";

const {
  scrapeSenderDetail
} = require("../scrapers/sender-detail.scraper");
const { executeWithAuthRetry } = require("../utils/auth-retry");

function createSenderDetailService({
  scrapeSenderDetailFn = scrapeSenderDetail,
  getAuthToken = () => process.env.AUTH_TOKEN || "",
  refreshAuth
} = {}) {
  return {
    async getSenderDetail(options) {
      return executeWithAuthRetry({
        getAuthToken,
        refreshAuth,
        operation: authToken => scrapeSenderDetailFn({
          ...options,
          authToken
        })
      });
    }
  };
}

module.exports = {
  createSenderDetailService
};
