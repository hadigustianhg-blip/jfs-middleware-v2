"use strict";

const { scrapeAgingSign } = require("../scrapers/aging-sign.scraper");

function createAgingSignService({
  scrapeAgingSignFn = scrapeAgingSign,
  getAuthToken = () => process.env.AUTH_TOKEN || ""
} = {}) {
  return {
    async getAgingSign(options) {
      const authToken = getAuthToken();

      if (!authToken) {
        const error = new Error("Token kosong");
        error.code = "TOKEN_EMPTY";
        throw error;
      }

      return scrapeAgingSignFn({
        ...options,
        authToken
      });
    }
  };
}

module.exports = {
  createAgingSignService
};
