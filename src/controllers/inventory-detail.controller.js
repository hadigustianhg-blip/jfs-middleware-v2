"use strict";

const moment = require("moment-timezone");
const { DEFAULT_TIMEZONE } = require("../config/constants");
const { getTodayJakarta } = require("../utils/date");
const { sendSuccess } = require("../utils/response");
const logger = require("../utils/logger");

function parseBoundedInteger(value, defaultValue, name) {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  if (!/^\d+$/.test(String(value))) {
    throw new RangeError(`${name} harus berupa bilangan bulat positif`);
  }

  const parsed = Number(value);
  if (parsed < 1 || parsed > 500) {
    throw new RangeError(`${name} harus antara 1 dan 500`);
  }

  return parsed;
}

function parseDate(value, name) {
  const parsed = moment.tz(value, "YYYY-MM-DD", true, DEFAULT_TIMEZONE);
  if (!parsed.isValid()) {
    throw new TypeError(`${name} harus berformat YYYY-MM-DD`);
  }
  return parsed;
}

function createInventoryDetailController({ inventoryDetailService }) {
  if (!inventoryDetailService) {
    throw new TypeError("inventoryDetailService is required");
  }

  return {
    async getInventoryDetail(req, res) {
      try {
        const startDate = req.query.startDate || getTodayJakarta();
        const endDate = req.query.endDate || startDate;
        const start = parseDate(startDate, "startDate");
        const end = parseDate(endDate, "endDate");

        if (start.isAfter(end)) {
          throw new RangeError("startDate tidak boleh setelah endDate");
        }

        const result = await inventoryDetailService.getInventoryDetail({
          startDate,
          endDate,
          billCode: req.query.billCode || "",
          size: parseBoundedInteger(req.query.size, 100, "size"),
          maxPage: parseBoundedInteger(req.query.maxPage, 100, "maxPage")
        });

        return sendSuccess(res, {
          success: true,
          total: result.data.length,
          pages: result.pageCount,
          data: result.data
        });
      } catch (error) {
        if (error.code === "TOKEN_EMPTY") {
          return res.status(400).json({ error: "Token kosong" });
        }

        if (error instanceof TypeError || error instanceof RangeError) {
          return res.status(400).json({ error: error.message });
        }

        logger.error("Inventory detail request failed", {
          code: error.code,
          status: error.status
        });
        return res.status(500).json({
          error: "Gagal ambil inventory detail",
          detail: error.message
        });
      }
    }
  };
}

module.exports = {
  createInventoryDetailController,
  parseBoundedInteger
};
