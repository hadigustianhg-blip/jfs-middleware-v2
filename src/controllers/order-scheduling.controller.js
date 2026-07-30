"use strict";

const moment = require("moment-timezone");
const logger = require("../utils/logger");
const {
  getEndOfDayJakarta,
  getStartOfDayJakarta,
  getTodayJakarta
} = require("../utils/date");

function parseOrderListRange(query) {
  const today = getTodayJakarta();
  const startDate = query.startDate || today;
  const endDate = query.endDate || today;
  const start = moment.tz(startDate, "YYYY-MM-DD", true, "Asia/Jakarta");
  const end = moment.tz(endDate, "YYYY-MM-DD", true, "Asia/Jakarta");
  if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
    throw new RangeError("INVALID_DATE_RANGE");
  }
  if (end.diff(start, "days") > 30) {
    throw new RangeError("DATE_RANGE_TOO_LARGE");
  }
  return {
    startTime: getStartOfDayJakarta(startDate),
    endTime: getEndOfDayJakarta(endDate)
  };
}

function createOrderSchedulingController({ service }) {
  return {
    async list(req, res) {
      try {
        const { startTime, endTime } = parseOrderListRange(req.query);
        const data = await service.getList({ startTime, endTime });
        return res.json({ success: true, total: data.length, startTime, endTime, data });
      } catch (error) {
        if (error instanceof RangeError) {
          return res.status(400).json({ success: false, error: error.message });
        }
        logger.error("OMS list-only request failed", { code: error.code, status: error.status });
        return res.status(error.code === "TOKEN_EMPTY" ? 400 : 502).json({ success: false, error: "ORDER_LIST_FAILED" });
      }
    },
    async detail(req, res) {
      const orderId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      if (!orderId) return res.status(400).json({ success: false, error: "ORDER_ID_REQUIRED" });
      try {
        return res.json({ success: true, data: await service.getDetail(orderId) });
      } catch (error) {
        logger.error("OMS single detail request failed", { code: error.code, status: error.status });
        return res.status(error.code === "TOKEN_EMPTY" ? 400 : 502).json({ success: false, error: "ORDER_DETAIL_FAILED" });
      }
    }
  };
}

module.exports = { createOrderSchedulingController, parseOrderListRange };
