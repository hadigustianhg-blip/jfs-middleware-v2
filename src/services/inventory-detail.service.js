"use strict";

const {
  scrapeInventoryDetail
} = require("../scrapers/inventory-detail.scraper");
const { executeWithAuthRetry } = require("../utils/auth-retry");

function createInventoryDetailService({
  scrapeInventoryDetailFn = scrapeInventoryDetail,
  getAuthToken = () => process.env.AUTH_TOKEN || "",
  refreshAuth
} = {}) {
  return {
    async getInventoryDetail(options) {
      return executeWithAuthRetry({
        getAuthToken,
        refreshAuth,
        operation: authToken => scrapeInventoryDetailFn({
          ...options,
          authToken
        })
      });
    }
  };
}

module.exports = {
  createInventoryDetailService
};
