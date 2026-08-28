"use strict";

const { scrapeAgingSign } = require("./aging-sign.scraper");
const { scrapeInventoryDetail } = require("./inventory-detail.scraper");
const { scrapeSensitiveDetail } = require("./sensitive.scraper");
const { scrapeWaybillStatus } = require("./waybill-status.scraper");
const { scrapeIbkReport } = require("./ibk-report.scraper");
const { scrapeSenderDetail } = require("./sender-detail.scraper");
const { scrapeWaybillTracking } = require("./waybill-tracking.scraper");
const { scrapeWaybillDetail } = require("./waybill-detail.scraper");

module.exports = {
  scrapeAgingSign,
  scrapeIbkReport,
  scrapeInventoryDetail,
  scrapeSenderDetail,
  scrapeSensitiveDetail,
  scrapeWaybillTracking,
  scrapeWaybillDetail,
  scrapeWaybillStatus
};
