"use strict";

const moment = require("moment-timezone");
const { DEFAULT_TIMEZONE } = require("../config/constants");
const logger = require("../utils/logger");

const DATE_FORMAT = "YYYY-MM-DD";
const MAX_RANGE_DAYS = 31;

function resolveIbkDateRange(query = {}, now = moment()) {
  const hasStart = query.startDate !== undefined && query.startDate !== "";
  const hasEnd = query.endDate !== undefined && query.endDate !== "";

  if (hasStart !== hasEnd) {
    const error = new RangeError("Rentang tanggal tidak valid.");
    error.code = "INVALID_DATE_RANGE";
    throw error;
  }

  const jakartaNow = moment.isMoment(now)
    ? now.clone().tz(DEFAULT_TIMEZONE)
    : moment(now).tz(DEFAULT_TIMEZONE);
  const startDate = hasStart
    ? query.startDate
    : jakartaNow.clone().subtract(1, "day").format(DATE_FORMAT);
  const endDate = hasEnd
    ? query.endDate
    : jakartaNow.format(DATE_FORMAT);
  const start = moment.tz(startDate, DATE_FORMAT, true, DEFAULT_TIMEZONE);
  const end = moment.tz(endDate, DATE_FORMAT, true, DEFAULT_TIMEZONE);

  if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
    const error = new RangeError("Rentang tanggal tidak valid.");
    error.code = "INVALID_DATE_RANGE";
    throw error;
  }

  if (end.diff(start, "days") + 1 > MAX_RANGE_DAYS) {
    const error = new RangeError("Rentang maksimal 31 hari.");
    error.code = "DATE_RANGE_TOO_LONG";
    throw error;
  }

  return {
    startDate,
    endDate,
    startTime: `${startDate} 00:00:00`,
    endTime: `${endDate} 23:59:59`
  };
}

function upstreamError(error) {
  let current = error;
  let foundUpstream = false;
  while (current) {
    if (current.isTimeout || current.code === "UPSTREAM_TIMEOUT") {
      return { status: 504, code: "SOURCE_TIMEOUT" };
    }
    if (
      current.isUpstream ||
      current.code === "PAGE_FETCH_FAILED" ||
      current.code === "INVALID_PAGINATION"
    ) {
      foundUpstream = true;
    }
    current = current.cause;
  }
  return foundUpstream
    ? { status: 502, code: "SOURCE_UNAVAILABLE" }
    : null;
}

function createIbkReportController({ ibkReportService, now = () => moment() }) {
  if (!ibkReportService) {
    throw new TypeError("ibkReportService is required");
  }

  return {
    async getIbkReport(req, res) {
      const startedAt = Date.now();
      let range;
      try {
        range = resolveIbkDateRange(req.query, now());
        const result = await ibkReportService.getIbkReport({
          startTime: range.startTime,
          endTime: range.endTime
        });

        logger.info("IBK report request completed", {
          startDate: range.startDate,
          endDate: range.endDate,
          pages: result.pageCount,
          records: result.data.length,
          durationMs: Date.now() - startedAt,
          success: true
        });

        return res.json({
          success: true,
          startDate: range.startDate,
          endDate: range.endDate,
          startTime: range.startTime,
          endTime: range.endTime,
          total: result.data.length,
          page: result.pageCount,
          data: result.data
        });
      } catch (error) {
        if (
          error.code === "INVALID_DATE_RANGE" ||
          error.code === "DATE_RANGE_TOO_LONG"
        ) {
          return res.status(400).json({
            success: false,
            message: error.message
          });
        }
        if (error.code === "TOKEN_EMPTY") {
          return res.status(400).json({
            success: false,
            message: "Token JFS belum tersedia."
          });
        }

        const sourceFailure = upstreamError(error);
        const status = sourceFailure?.status || 502;
        logger.error("IBK report request failed", {
          startDate: range?.startDate,
          endDate: range?.endDate,
          durationMs: Date.now() - startedAt,
          success: false,
          code: sourceFailure?.code || "SOURCE_UNAVAILABLE"
        });
        return res.status(status).json({
          success: false,
          message: status === 504
            ? "Sumber data JFS mengalami timeout."
            : "Sumber data JFS tidak tersedia."
        });
      }
    }
  };
}

module.exports = {
  MAX_RANGE_DAYS,
  createIbkReportController,
  resolveIbkDateRange,
  upstreamError
};
