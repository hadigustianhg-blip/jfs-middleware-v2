"use strict";

const {
  scrapeWaybillStatus
} = require("../scrapers/waybill-status.scraper");
const { executeWithAuthRetry } = require("../utils/auth-retry");
const { externalRequest } = require("../utils/request");
const logger = require("../utils/logger");
const { assertExpectedNetworkCode } = require("../context/network-validation");

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

/**
 * Pilot service for Waybill Status operating strictly on an isolated JfsOutletContext.
 * FAIL CLOSED: Does NOT fall back to global AUTH_TOKEN or legacy outlet config.
 */
function createContextWaybillStatusService(context, options = {}) {
  if (!context || typeof context !== "object") {
    const error = new Error("Valid JfsOutletContext is required");
    error.code = "INVALID_OUTLET_CONTEXT";
    error.status = 400;
    throw error;
  }

  const { tenantId, outletId, outletCode, config, authManager, httpClient } = context;

  if (!tenantId || !outletId || !outletCode || !config) {
    const error = new Error("Context is incomplete or missing outlet config");
    error.code = "MISSING_OUTLET_CONFIG";
    error.status = 400;
    throw error;
  }

  const scanSiteCode = config.scanSiteCode;
  if (!scanSiteCode) {
    const error = new Error("scanSiteCode is required in outlet config");
    error.code = "MISSING_OUTLET_CONFIG";
    error.status = 400;
    throw error;
  }

  const scrapeWaybillStatusFn = options.scrapeWaybillStatusFn || scrapeWaybillStatus;

  return {
    async getWaybillStatusBatch({ waybills, startDate, endDate }) {
      const normalizedWaybills = normalizeWaybills(waybills);
      const authToken = context.getAuthToken();

      if (!authToken) {
        const error = new Error("JFS auth token not configured for outlet context");
        error.code = "JFS_AUTH_NOT_CONFIGURED";
        error.status = 401;
        throw error;
      }

      // Validate network code alignment if actual login profile is available
      if (authManager && typeof authManager.getNetworkCode === "function") {
        const actualNetworkCode = authManager.getNetworkCode();
        if (actualNetworkCode) {
          assertExpectedNetworkCode(config.networkCode, actualNetworkCode);
        }
      }

      logger.info("Pilot waybill status request initiated", {
        tenantId,
        outletId,
        outletCode,
        operation: "WAYBILL_STATUS",
        waybillCount: normalizedWaybills.length
      });

      const scopedRequestFn = (reqOpts) => externalRequest({
        ...reqOpts,
        axiosInstance: httpClient
      });

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
            getAuthToken: () => context.getAuthToken(),
            refreshAuth: () => (authManager ? authManager.refreshLogin() : Promise.resolve(null)),
            operation: currentAuthToken => scrapeWaybillStatusFn({
              waybills: batch,
              startDate,
              endDate,
              authToken: currentAuthToken,
              scanSiteCode,
              requestFn: scopedRequestFn
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
  createContextWaybillStatusService,
  normalizeWaybills
};
