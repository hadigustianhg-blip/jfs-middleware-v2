"use strict";

const moment = require("moment-timezone");
const { DEFAULT_TIMEZONE } = require("../config/constants");
const { getTodayJakarta } = require("../utils/date");
const logger = require("../utils/logger");

function parseDate(value, name) {
  const parsed = moment.tz(value, "YYYY-MM-DD", true, DEFAULT_TIMEZONE);
  if (!parsed.isValid()) {
    const error = new TypeError(`${name} harus berformat YYYY-MM-DD`);
    error.code = "INVALID_DATE";
    throw error;
  }
  return parsed;
}

function createWaybillStatusController({ waybillStatusService }) {
  if (!waybillStatusService) {
    throw new TypeError("waybillStatusService is required");
  }

  return {
    async getWaybillStatusBatch(req, res) {
      try {
        const startDate = req.body?.startDate || getTodayJakarta();
        const endDate = req.body?.endDate || startDate;
        const start = parseDate(startDate, "startDate");
        const end = parseDate(endDate, "endDate");

        if (start.isAfter(end)) {
          const error = new RangeError(
            "startDate tidak boleh setelah endDate"
          );
          error.code = "INVALID_DATE";
          throw error;
        }

        const result = await waybillStatusService.getWaybillStatusBatch({
          waybills: req.body?.waybills,
          startDate,
          endDate
        });
        return res.json(result);
      } catch (error) {
        if (
          error.code === "TOKEN_EMPTY" ||
          error.code === "INVALID_WAYBILLS" ||
          error.code === "WAYBILL_LIMIT_EXCEEDED" ||
          error.code === "INVALID_DATE"
        ) {
          return res.status(400).json({
            success: false,
            error: error.message
          });
        }

        logger.error("Waybill status batch request failed", {
          code: error.code,
          status: error.status
        });
        return res.status(500).json({
          success: false,
          error: "Gagal memproses waybill status batch"
        });
      }
    }
  };
}

module.exports = {
  createWaybillStatusController
};
