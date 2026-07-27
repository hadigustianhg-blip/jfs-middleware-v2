"use strict";

const { scrapeAgingSign } = require("./aging-sign.scraper");
const { scrapeInventoryDetail } = require("./inventory-detail.scraper");
const { scrapeSensitiveDetail } = require("./sensitive.scraper");

module.exports = {
  scrapeAgingSign,
  scrapeInventoryDetail,
  scrapeSensitiveDetail
};
