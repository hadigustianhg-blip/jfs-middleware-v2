"use strict";

const { scrapeOrderDetail, scrapeOrderList } = require("../scrapers/order-scheduling.scraper");
const { isEmergencyTokenModeActive, getEmergencyToken } = require("../utils/emergency-token");

function createOrderSchedulingService({ getAuthToken, listScraper = scrapeOrderList, detailScraper = scrapeOrderDetail }) {
  const token = async () => {
    if (isEmergencyTokenModeActive()) {
      return getEmergencyToken();
    }
    const value = typeof getAuthToken === "function" ? (await getAuthToken()) : "";
    if (!value) { const error = new Error("Token kosong"); error.code = "TOKEN_EMPTY"; throw error; }
    return value;
  };
  return {
    async getList(input) {
      const authToken = await token();
      return listScraper({ ...input, authToken });
    },
    async getDetail(orderId) {
      const authToken = await token();
      return detailScraper({ orderId, authToken });
    }
  };
}

module.exports = { createOrderSchedulingService };
