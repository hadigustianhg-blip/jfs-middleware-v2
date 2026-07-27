"use strict";

const { scrapeAbnormalPiece } = require("./abnormal-piece.scraper");
const { scrapeAgingSign } = require("./aging-sign.scraper");
const { scrapeInventoryDetail } = require("./inventory-detail.scraper");
const { scrapeSensitiveDetail } = require("./sensitive.scraper");

module.exports = {
  scrapeAbnormalPiece,
  scrapeAgingSign,
  scrapeInventoryDetail,
  scrapeSensitiveDetail
};
