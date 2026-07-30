"use strict";

const moment = require("moment-timezone");
const logger = require("../utils/logger");

function createOrderSchedulingController({ service }) {
  return {
    async list(req, res) {
      const startTime = req.query.start || moment().tz("Asia/Jakarta").startOf("day").format("YYYY-MM-DD HH:mm:ss");
      const endTime = req.query.end || moment().tz("Asia/Jakarta").endOf("day").format("YYYY-MM-DD HH:mm:ss");
      try {
        const data = await service.getList({ startTime, endTime });
        return res.json({ success: true, total: data.length, startTime, endTime, data });
      } catch (error) {
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

module.exports = { createOrderSchedulingController };
