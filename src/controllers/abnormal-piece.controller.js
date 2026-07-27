"use strict";

const logger = require("../utils/logger");

function createAbnormalPieceController({ abnormalPieceService }) {
  if (!abnormalPieceService) {
    throw new TypeError("abnormalPieceService is required");
  }

  return {
    async getAbnormalPieceBatch(req, res) {
      try {
        const result = await abnormalPieceService.getAbnormalPieceBatch({
          waybills: req.body?.waybills
        });
        return res.json(result);
      } catch (error) {
        if (
          error.code === "TOKEN_EMPTY" ||
          error.code === "INVALID_WAYBILLS" ||
          error.code === "WAYBILL_LIMIT_EXCEEDED"
        ) {
          return res.status(400).json({
            success: false,
            error: error.message
          });
        }

        logger.error("Abnormal piece batch request failed", {
          code: error.code,
          status: error.status
        });
        return res.status(500).json({
          success: false,
          error: "Gagal memproses abnormal piece batch"
        });
      }
    }
  };
}

module.exports = {
  createAbnormalPieceController
};
