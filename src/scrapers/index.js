"use strict";

const { scrapeAgingSign } = require("./aging-sign.scraper");
const { scrapeInventoryDetail } = require("./inventory-detail.scraper");
const { scrapeSensitiveDetail } = require("./sensitive.scraper");
const { scrapeWaybillStatus } = require("./waybill-status.scraper");
const { scrapeIbkReport } = require("./ibk-report.scraper");

module.exports = {
  scrapeAgingSign,
  scrapeIbkReport,
  scrapeInventoryDetail,
  scrapeSensitiveDetail,
  scrapeWaybillStatus
};
