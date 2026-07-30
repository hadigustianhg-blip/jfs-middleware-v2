"use strict";

const { scrapeOrderDetail, scrapeOrderList } = require("../scrapers/order-scheduling.scraper");

function createOrderSchedulingService({ getAuthToken, listScraper = scrapeOrderList, detailScraper = scrapeOrderDetail }) {
  const token = () => {
    const value = getAuthToken?.();
    if (!value) { const error = new Error("Token kosong"); error.code = "TOKEN_EMPTY"; throw error; }
    return value;
  };
  return {
    getList: input => listScraper({ ...input, authToken: token() }),
    getDetail: orderId => detailScraper({ orderId, authToken: token() })
  };
}

module.exports = { createOrderSchedulingService };
