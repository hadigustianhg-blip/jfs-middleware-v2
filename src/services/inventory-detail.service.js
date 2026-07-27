"use strict";

const {
  scrapeInventoryDetail
} = require("../scrapers/inventory-detail.scraper");

function createInventoryDetailService({
  scrapeInventoryDetailFn = scrapeInventoryDetail,
  getAuthToken = () => process.env.AUTH_TOKEN || ""
} = {}) {
  return {
    async getInventoryDetail(options) {
      const authToken = getAuthToken();

      if (!authToken) {
        const error = new Error("Token kosong");
        error.code = "TOKEN_EMPTY";
        throw error;
      }

      return scrapeInventoryDetailFn({
        ...options,
        authToken
      });
    }
  };
}

module.exports = {
  createInventoryDetailService
};
