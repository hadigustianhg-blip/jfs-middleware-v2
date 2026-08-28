"use strict";

const {
  scrapeWaybillStatus
} = require("../scrapers/waybill-status.scraper");
const { executeWithAuthRetry } = require("../utils/auth-retry");

const MAX_WAYBILLS = 500;
const JFS_BATCH_SIZE = 100;

function normalizeWaybills(waybills) {
  if (!Array.isArray(waybills)) {
    const error = new TypeError("waybills harus berupa array");
    error.code = "INVALID_WAYBILLS";
    throw error;
  }

  const normalized = [...new Set(
    waybills
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value).trim())
      .filter(Boolean)
  )];

  if (normalized.length > MAX_WAYBILLS) {
    const error = new RangeError(
      `waybills maksimal ${MAX_WAYBILLS} nilai unik`
    );
    error.code = "WAYBILL_LIMIT_EXCEEDED";
    throw error;
  }

  return normalized;
}

function createWaybillStatusService({
  scrapeWaybillStatusFn = scrapeWaybillStatus,
  getAuthToken = () => process.env.AUTH_TOKEN || "",
  refreshAuth
} = {}) {
  return {
    async getWaybillStatusBatch({ waybills, startDate, endDate }) {
      const normalizedWaybills = normalizeWaybills(waybills);
      if (!getAuthToken()) {
        const error = new Error("Token kosong");
        error.code = "TOKEN_EMPTY";
        throw error;
      }

      const data = [];
      const errors = [];
      const foundWaybills = new Set();
      const completedWaybills = new Set();

      for (
        let offset = 0;
        offset < normalizedWaybills.length;
        offset += JFS_BATCH_SIZE
      ) {
        const batch = normalizedWaybills.slice(offset, offset + JFS_BATCH_SIZE);

        try {
          const result = await executeWithAuthRetry({
            getAuthToken,
            refreshAuth,
            operation: authToken => scrapeWaybillStatusFn({
              waybills: batch,
              startDate,
              endDate,
              authToken
            })
          });

          for (const waybill of batch) {
            completedWaybills.add(waybill);
          }
          for (const record of result.data) {
            const sourceWaybill = String(record.billCode || "");
            if (batch.includes(sourceWaybill)) {
              foundWaybills.add(sourceWaybill);
            }
            data.push({
              sourceWaybill,
              status: "success",
              ...record
            });
          }
        } catch (error) {
          errors.push(...batch.map(sourceWaybill => ({
            sourceWaybill,
            status: "failed",
            error: error.message
          })));
        }
      }

      for (const waybill of normalizedWaybills) {
        if (completedWaybills.has(waybill) && !foundWaybills.has(waybill)) {
          data.push({
            sourceWaybill: waybill,
            status: "not_found"
          });
        }
      }

      return {
        success: true,
        totalRequested: normalizedWaybills.length,
        totalFound: foundWaybills.size,
        totalNotFound: completedWaybills.size - foundWaybills.size,
        data,
        errors
      };
    }
  };
}

module.exports = {
  JFS_BATCH_SIZE,
  MAX_WAYBILLS,
  createWaybillStatusService,
  normalizeWaybills
};
