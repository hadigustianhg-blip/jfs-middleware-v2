"use strict";

const { randomUUID } = require("node:crypto");
const logger = require("../utils/logger");

const WAYBILL_PATTERN = /^\d{8,20}$/;

function normalizeWaybillNo(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return WAYBILL_PATTERN.test(normalized) ? normalized : null;
}

function maskWaybillNo(value) {
  if (!value) {
    return null;
  }
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function errorChain(error) {
  const errors = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    errors.push(current);
    current = current.cause;
  }
  return errors;
}

function classifySenderDetailError(error) {
  const errors = errorChain(error);
  if (errors.some(item => item.code === "TOKEN_EMPTY")) {
    return {
      status: 500,
      code: "JFS_AUTH_NOT_CONFIGURED",
      message: "Autentikasi JFS belum dikonfigurasi"
    };
  }
  if (errors.some(item =>
    item.code === "UNAUTHORIZED" ||
    item.status === 401 ||
    item.status === 403 ||
    item.response?.status === 401 ||
    item.response?.status === 403
  )) {
    return {
      status: 502,
      code: "JFS_AUTH_EXPIRED",
      message: "Sesi JFS tidak valid atau telah berakhir"
    };
  }
  if (errors.some(item =>
    item.isTimeout ||
    item.code === "UPSTREAM_TIMEOUT" ||
    item.code === "ETIMEDOUT" ||
    item.code === "ECONNABORTED"
  )) {
    return {
      status: 504,
      code: "JFS_UPSTREAM_TIMEOUT",
      message: "Sumber data JFS mengalami timeout"
    };
  }
  return {
    status: 502,
    code: "JFS_UPSTREAM_ERROR",
    message: "Sumber data JFS tidak tersedia"
  };
}

function errorResponse(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message }
  });
}

function createSenderDetailController({
  senderDetailService,
  now = () => Date.now(),
  createRequestId = randomUUID
}) {
  if (!senderDetailService) {
    throw new TypeError("senderDetailService is required");
  }

  return {
    async getSenderDetail(req, res) {
      const startedAt = now();
      const requestId = req.headers?.["x-request-id"] || createRequestId();
      const waybillNo = normalizeWaybillNo(req.query?.waybillNo);

      if (!waybillNo) {
        return errorResponse(
          res,
          400,
          "INVALID_WAYBILL_NO",
          "waybillNo tidak valid"
        );
      }

      const logContext = {
        endpoint: "/jfs-sender-detail",
        requestId,
        waybillNo: maskWaybillNo(waybillNo)
      };

      try {
        const result = await senderDetailService.getSenderDetail({ waybillNo });
        const durationMs = Math.max(0, now() - startedAt);
        if (!result.data) {
          logger.info("Sender detail not found", {
            ...logContext,
            upstreamStatus: result.upstreamStatus,
            durationMs,
            success: false,
            errorCode: "SENDER_DETAIL_NOT_FOUND"
          });
          return errorResponse(
            res,
            404,
            "SENDER_DETAIL_NOT_FOUND",
            "Detail pengirim tidak ditemukan"
          );
        }

        logger.info("Sender detail request completed", {
          ...logContext,
          upstreamStatus: result.upstreamStatus,
          durationMs,
          success: true
        });
        return res.json({
          success: true,
          data: result.data,
          meta: {
            waybillNo,
            source: "JFS"
          }
        });
      } catch (error) {
        const mapped = classifySenderDetailError(error);
        logger.error("Sender detail request failed", {
          ...logContext,
          durationMs: Math.max(0, now() - startedAt),
          upstreamStatus: error.status || error.response?.status,
          success: false,
          errorCode: mapped.code
        });
        return errorResponse(res, mapped.status, mapped.code, mapped.message);
      }
    }
  };
}

module.exports = {
  WAYBILL_PATTERN,
  classifySenderDetailError,
  createSenderDetailController,
  maskWaybillNo,
  normalizeWaybillNo
};
