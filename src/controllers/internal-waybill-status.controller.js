"use strict";

const { createContextWaybillStatusService } = require("../services/waybill-status.service");
const { resolveContextFromRequest, ContextResolverError } = require("../context/trusted-context-resolver");
const logger = require("../utils/logger");

function createInternalWaybillStatusController(options = {}) {
  const { registry, expectedAuthKey = process.env.JFS_AUTH_KEY } = options;

  return async function handleInternalWaybillStatus(req, res) {
    const startTime = Date.now();
    let resolvedContext = null;

    try {
      // 2-Layer Security Context Resolution (Header ONLY)
      resolvedContext = resolveContextFromRequest(req, {
        registry,
        expectedAuthKey
      });

      const { waybills, startDate, endDate } = req.body || {};

      if (!waybills || !Array.isArray(waybills) || waybills.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_WAYBILLS",
            message: "waybills harus berupa array tidak kosong"
          }
        });
      }

      const service = createContextWaybillStatusService(resolvedContext, options);
      const result = await service.getWaybillStatusBatch({
        waybills,
        startDate,
        endDate
      });

      const durationMs = Date.now() - startTime;
      logger.info("Internal pilot waybill status request completed", {
        tenantId: resolvedContext.tenantId,
        outletId: resolvedContext.outletId,
        outletCode: resolvedContext.outletCode,
        operation: "WAYBILL_STATUS",
        status: 200,
        durationMs
      });

      return res.status(200).json({
        success: true,
        metadata: {
          outletCode: resolvedContext.outletCode,
          operation: "WAYBILL_STATUS"
        },
        ...result
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const status = error.status || (error.code === "UNAUTHORIZED" || error.code === "UNAUTHORIZED_CALLER" ? 401 : 500);
      const code = error.code || "INTERNAL_ERROR";

      if (resolvedContext) {
        logger.error("Internal pilot waybill status request failed", {
          tenantId: resolvedContext.tenantId,
          outletId: resolvedContext.outletId,
          outletCode: resolvedContext.outletCode,
          operation: "WAYBILL_STATUS",
          status,
          code,
          durationMs
        });
      } else {
        logger.error("Internal pilot context resolution failed", {
          operation: "WAYBILL_STATUS",
          status,
          code,
          durationMs
        });
      }

      return res.status(status).json({
        success: false,
        error: {
          code,
          message: error.message || "Internal server error"
        }
      });
    }
  };
}

const express = require("express");

function createInternalPilotRoutes(options = {}) {
  const router = express.Router();
  const handleWaybillStatus = createInternalWaybillStatusController(options);

  router.post("/internal/v1/waybill-status", handleWaybillStatus);

  return router;
}

module.exports = {
  createInternalWaybillStatusController,
  createInternalPilotRoutes
};
