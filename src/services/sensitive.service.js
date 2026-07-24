"use strict";

const {
  scrapeSensitiveDetail
} = require("../scrapers/sensitive.scraper");

function createSensitiveService({
  scrapeSensitiveDetailFn = scrapeSensitiveDetail,
  getAuthToken = () => process.env.AUTH_TOKEN || ""
} = {}) {
  return {
    async getSensitiveDetail(options) {
      const authToken = getAuthToken();

      if (!authToken) {
        const error = new Error("Token kosong");
        error.code = "TOKEN_EMPTY";
        throw error;
      }

      return scrapeSensitiveDetailFn({
        ...options,
        authToken
      });
    }
  };
}

module.exports = {
  createSensitiveService
};
