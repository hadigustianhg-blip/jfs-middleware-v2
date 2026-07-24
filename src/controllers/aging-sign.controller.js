"use strict";

const { getTodayJakarta } = require("../utils/date");
const { sendSuccess } = require("../utils/response");
const logger = require("../utils/logger");

function createAgingSignController({ agingSignService }) {
  if (!agingSignService) {
    throw new TypeError("agingSignService is required");
  }

  return {
    async getAgingSign(req, res) {
      try {
        const date = req.query.date || getTodayJakarta();
        const result = await agingSignService.getAgingSign({ date });

        return sendSuccess(res, {
          success: true,
          total: result.data.length,
          data: result.data
        });
      } catch (error) {
        if (error.code === "TOKEN_EMPTY") {
          return res.status(400).json({
            error: "Token kosong"
          });
        }

        logger.error("Aging sign request failed", {
          code: error.code,
          status: error.status
        });

        return res.status(500).json({
          error: "Gagal ambil aging sign",
          detail: error.message
        });
      }
    }
  };
}

module.exports = {
  createAgingSignController
};
