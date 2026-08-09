"use strict";

const { getEnv, getNumberEnv } = require("./env");

/**
 * Legacy outlet configuration for JFS scraping endpoints.
 * Fallbacks preserve historical SUM001A / BDO000 production values.
 */
function getOutletConfig() {
  return {
    networkCode: getEnv("JFS_NETWORK_CODE", "SUM001A"),
    financeCode: getEnv("JFS_FINANCE_CODE", "BDO000"),
    financeId: getNumberEnv("JFS_FINANCE_ID", 183),
    scanSiteCode: getEnv("JFS_SCAN_SITE_CODE", "SUM001A")
  };
}

module.exports = {
  getOutletConfig
};
