"use strict";

const logger = require("../utils/logger");

function createSensitiveController({ sensitiveService }) {
  if (!sensitiveService) {
    throw new TypeError("sensitiveService is required");
  }

  return {
    async getSensitiveDetail(req, res) {
      try {
        const result = await sensitiveService.getSensitiveDetail({
          waybillNo: req.query.waybillNo
        });

        return res.json({
          success: true,
          data: result.data
        });
      } catch (error) {
        if (error.code === "TOKEN_EMPTY") {
          return res.status(400).json({
            error: "Token kosong"
          });
        }

        logger.error("Sensitive detail request failed", {
          code: error.code,
          status: error.status
        });

        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  };
}

module.exports = {
  createSensitiveController
};
