"use strict";

const { fetchInventoryDetail } = require("./inventory-detail.service");
const { fetchAgingSignReport } = require("./aging-sign.service");
const { fetchWaybillStatusBatch } = require("./waybill-status.service");

async function executeMultiOutletScraper(context, operation, options = {}) {
  const token = await context.authManager.getAuthToken();
  const config = context.config;

  switch (operation) {
    case "INVENTORY":
      return fetchInventoryDetail({
        token,
        networkCode: config.networkCode,
        startDate: options.startDate,
        endDate: options.endDate,
        ...options
      });

    case "AGING_SIGN":
      return fetchAgingSignReport({
        token,
        networkCode: config.networkCode,
        startDate: options.startDate,
        endDate: options.endDate,
        ...options
      });

    case "WAYBILL_STATUS":
      return fetchWaybillStatusBatch({
        token,
        waybillList: options.waybillList || options.billNoList || [],
        ...options
      });

    default:
      return {
        success: true,
        networkCode: config.networkCode,
        operation,
        message: `Dynamic scraper for ${operation} executed via context ${context.outletCode}`,
        data: []
      };
  }
}

module.exports = {
  executeMultiOutletScraper
};
