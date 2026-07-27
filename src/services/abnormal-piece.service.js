"use strict";

const {
  scrapeAbnormalPiece
} = require("../scrapers/abnormal-piece.scraper");

const MAX_WAYBILLS = 500;
const BATCH_CONCURRENCY = 3;
const BATCH_DELAY_MS = 150;

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

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function createAbnormalPieceService({
  scrapeAbnormalPieceFn = scrapeAbnormalPiece,
  getAuthToken = () => process.env.AUTH_TOKEN || "",
  delayFn = wait
} = {}) {
  return {
    async getAbnormalPieceBatch({ waybills }) {
      const normalizedWaybills = normalizeWaybills(waybills);
      const authToken = getAuthToken();

      if (!authToken) {
        const error = new Error("Token kosong");
        error.code = "TOKEN_EMPTY";
        throw error;
      }

      const data = [];
      const errors = [];
      let totalSuccess = 0;
      let totalNotFound = 0;

      for (
        let offset = 0;
        offset < normalizedWaybills.length;
        offset += BATCH_CONCURRENCY
      ) {
        const batch = normalizedWaybills.slice(
          offset,
          offset + BATCH_CONCURRENCY
        );
        const results = await Promise.all(batch.map(async sourceWaybill => {
          try {
            const result = await scrapeAbnormalPieceFn({
              waybillId: sourceWaybill,
              authToken
            });
            return { sourceWaybill, records: result.data };
          } catch (error) {
            return { sourceWaybill, error };
          }
        }));

        for (const result of results) {
          if (result.error) {
            errors.push({
              sourceWaybill: result.sourceWaybill,
              status: "failed",
              error: result.error.message
            });
          } else if (result.records.length === 0) {
            totalNotFound += 1;
            data.push({
              sourceWaybill: result.sourceWaybill,
              status: "not_found"
            });
          } else {
            totalSuccess += 1;
            data.push(...result.records.map(record => ({
              sourceWaybill: result.sourceWaybill,
              status: "success",
              ...record
            })));
          }
        }

        if (offset + BATCH_CONCURRENCY < normalizedWaybills.length) {
          await delayFn(BATCH_DELAY_MS);
        }
      }

      return {
        success: true,
        totalRequested: normalizedWaybills.length,
        totalSuccess,
        totalNotFound,
        totalFailed: errors.length,
        data,
        errors
      };
    }
  };
}

module.exports = {
  BATCH_CONCURRENCY,
  BATCH_DELAY_MS,
  MAX_WAYBILLS,
  createAbnormalPieceService,
  normalizeWaybills
};
