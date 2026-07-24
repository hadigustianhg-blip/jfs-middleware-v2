"use strict";

const { scrapeAgingSign } = require("./aging-sign.scraper");
const { scrapeSensitiveDetail } = require("./sensitive.scraper");

module.exports = {
  scrapeAgingSign,
  scrapeSensitiveDetail
};
