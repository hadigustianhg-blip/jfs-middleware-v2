"use strict";

const { scrapeIbkReport } = require("../scrapers/ibk-report.scraper");
const { executeWithAuthRetry } = require("../utils/auth-retry");

function createIbkReportService({
  scrapeIbkReportFn = scrapeIbkReport,
  getAuthToken = () => process.env.AUTH_TOKEN || "",
  refreshAuth
} = {}) {
  return {
    async getIbkReport(options) {
      return executeWithAuthRetry({
        getAuthToken,
        refreshAuth,
        operation: authToken => scrapeIbkReportFn({
          ...options,
          authToken
        })
      });
    }
  };
}

module.exports = {
  createIbkReportService
};
