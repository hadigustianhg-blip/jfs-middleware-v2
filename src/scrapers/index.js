"use strict";

const { scrapeAgingSign } = require("./aging-sign.scraper");
const { scrapeInventoryDetail } = require("./inventory-detail.scraper");
const { scrapeSensitiveDetail } = require("./sensitive.scraper");
const { scrapeWaybillStatus } = require("./waybill-status.scraper");

module.exports = {
  scrapeAgingSign,
  scrapeInventoryDetail,
  scrapeSensitiveDetail,
  scrapeWaybillStatus
};
