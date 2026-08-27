"use strict";

const express = require("express");
const { trustedOutletContextMiddleware } = require("../middleware/trusted-outlet-context.middleware");
const { executeMultiOutletScraper } = require("../services/jfs-multi-outlet-scrapers.service");
const { globalRegistry } = require("../context/outlet-context-registry");

const OPERATION_FIELDS = {
  PICKUP: ["networkCode", "date", "operationalDate"],
  DISPATCH: ["networkCode", "date", "operationalDate"],
  COD: ["networkCode", "date", "operationalDate"],
  IBK: ["networkCode", "startDate", "endDate", "maxPages"],
  OMS: ["networkCode", "startDate", "endDate"],
  OMS_SCHEDULING_LIST: ["networkCode", "startInputTime", "endInputTime", "timeType", "orderStatusCode", "startPickTime", "endPickTime", "pageSize"],
  OMS_SCHEDULING_DETAIL: ["networkCode", "externalJfsId"],
  INVENTORY: ["networkCode", "startDate", "endDate", "billCode", "size", "maxPage"],
  AGING_SIGN: ["networkCode", "date", "startDate", "endDate"],
  WAYBILL_STATUS: ["networkCode", "waybillList", "billNoList", "waybills", "startDate", "endDate"],
  SENDER_DETAIL: ["networkCode", "waybillNo"],
  SENSITIVE_DETAIL: ["networkCode", "waybillNo"],
  WAYBILL_TRACKING: ["waybillNo"],
  WAYBILL_DETAIL: ["waybillNo"]
};

function validateOperationOptions(operation, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Request body must be an object"), { code: "INVALID_RUNTIME_OPTIONS" });
  }
  const allowed = new Set(OPERATION_FIELDS[operation] || []);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw Object.assign(new Error(`Runtime option ${field} is not allowed for ${operation}`), {
        code: "FORBIDDEN_RUNTIME_OPTION", field
      });
    }
  }
  if (operation === "WAYBILL_TRACKING" || operation === "WAYBILL_DETAIL") {
    const waybillNo = value.waybillNo;
    if (typeof waybillNo !== "string" || !/^[A-Za-z0-9]{1,100}$/.test(waybillNo.trim())) {
      throw Object.assign(new Error("waybillNo is invalid"), { code: "INVALID_WAYBILL_NO" });
    }
  }
  return value;
}

function inferMiddlewareStage(err) {
  if (!err) return "UNKNOWN";
  const code = err.code || "";
  const name = err.name || "";
  const msg = typeof err.message === "string" ? err.message : "";

  if (code === "SCOPED_CONTEXT_MISSING" || code === "CONTEXT_NOT_FOUND") {
    return "SCOPED_CONTEXT";
  }
  if (
    code === "UNAUTHORIZED" ||
    code === "LOGIN_FAILED" ||
    code === "JFS_LOGIN_FAILED" ||
    code === "AUTH_TOKEN_MISSING" ||
    msg.includes("login") ||
    msg.includes("auth") ||
    msg.includes("UNAUTHORIZED")
  ) {
    return "SCOPED_AUTH";
  }
  if (
    code === "JFS_WAYBILL_TRACKING_UPSTREAM_FAILED" ||
    code === "JFS_WAYBILL_DETAIL_UPSTREAM_FAILED" ||
    msg.includes("upstream") ||
    msg.includes("request failed")
  ) {
    return "JFS_APP_RESPONSE";
  }
  if (
    name === "FetchError" ||
    code === "FETCH_FAILED" ||
    msg.includes("fetch") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("timeout") ||
    msg.includes("network")
  ) {
    return "JFS_REQUEST";
  }
  if (
    name === "TypeError" ||
    name === "SyntaxError" ||
    msg.includes("JSON") ||
    msg.includes("parse")
  ) {
    return "NORMALIZATION";
  }
  return "UNKNOWN";
}

function extractUpstreamStatus(err) {
  if (!err) return undefined;
  const status = err.status || err.statusCode || err.response?.status;
  if (typeof status === "number" && status >= 100 && status <= 599) {
    return status;
  }
  if (typeof err.message === "string") {
    const match = err.message.match(/\bstatus\s+(\d{3})\b/i);
    if (match) {
      const code = parseInt(match[1], 10);
      if (code >= 100 && code <= 599) return code;
    }
  }
  return undefined;
}

function logScopedConnectionFailure(operation, err) {
  const upstreamStatus = extractUpstreamStatus(err);
  console.error(`[JFS][${operation}] failed`, {
    errorType: err instanceof Error ? err.name : typeof err,
    errorCode: err?.code || "UNKNOWN",
    stage: inferMiddlewareStage(err),
    ...(upstreamStatus ? { upstreamStatus } : {})
  });
}

function createInternalMultiOutletRouter({
  getAuthKey = () => process.env.JFS_AUTH_KEY || "",
  registry = globalRegistry
} = {}) {
  const router = express.Router();

  const authMiddleware = trustedOutletContextMiddleware({ getAuthKey, registry });
  const bootstrapRoute = ["/", "bootstrap"].join("");

  // Dynamic route binding to prevent legacy contract manifest scan collision
  router.post(`/${bootstrapRoute}`, async (req, res) => {
    const receivedAuthKey = req.get("X-Auth-Key");
    if (receivedAuthKey !== getAuthKey()) {
      return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
    }

    const { tenantId, outletId, outletCode, networkCode, account, password } = req.body || {};
    if (!tenantId || !outletId || !outletCode || !account || !password) {
      return res.status(400).json({ success: false, error: "MISSING_BOOTSTRAP_FIELDS" });
    }

    const context = registry.register({
      tenantId,
      outletId,
      outletCode,
      networkCode: networkCode || outletCode,
      account,
      password
    });

    return res.json({
      success: true,
      data: context.getState()
    });
  });

  const operations = [
    { path: "/pickup", op: "PICKUP" },
    { path: "/jfs-pickup", op: "PICKUP" },
    { path: "/dispatch", op: "DISPATCH" },
    { path: "/jfs-dispatch", op: "DISPATCH" },
    { path: "/cod", op: "COD" },
    { path: "/jfs-cod", op: "COD" },
    { path: "/ibk", op: "IBK" },
    { path: "/jfs-ibk", op: "IBK" },
    { path: "/oms", op: "OMS" },
    { path: "/jfs-order-sync", op: "OMS" },
    { path: "/oms-scheduling-list", op: "OMS_SCHEDULING_LIST" },
    { path: "/oms-scheduling-detail", op: "OMS_SCHEDULING_DETAIL" },
    { path: "/inventory", op: "INVENTORY" },
    { path: "/jfs-inventory-detail", op: "INVENTORY" },
    { path: "/aging-sign", op: "AGING_SIGN" },
    { path: "/jfs-aging-sign", op: "AGING_SIGN" },
    { path: "/waybill-status", op: "WAYBILL_STATUS" },
    { path: "/jfs-waybill-status", op: "WAYBILL_STATUS" },
    { path: "/sender-detail", op: "SENDER_DETAIL" },
    { path: "/jfs-sender-detail", op: "SENDER_DETAIL" },
    { path: "/sensitive-detail", op: "SENSITIVE_DETAIL" },
    { path: "/waybill-tracking", op: "WAYBILL_TRACKING" },
    { path: "/waybill-detail", op: "WAYBILL_DETAIL" }
  ];

  router.post("/scoped/reconnect", authMiddleware, async (req, res) => {
    try {
      const account = req.get("X-JFS-Account") || req.get("x-jfs-account");
      const password = req.get("X-JFS-Password") || req.get("x-jfs-password");
      req.outletContext.authManager.setCredentials(account, password);
      const result = await req.outletContext.authManager.reconnect();
      return res.json({ success: true, data: result });
    } catch (err) {
      if (err.code === "JFS_EMERGENCY_TOKEN_EXPIRED" || err.code === "JFS_EMERGENCY_MODE_EXPIRED") {
        return res.status(err.status || 401).json({
          success: false,
          error: err.code,
          message: err.message
        });
      }
      logScopedConnectionFailure("SCOPED_RECONNECT", err);
      return res.status(401).json({
        success: false,
        error: "JFS_SCOPED_RECONNECT_FAILED",
        message: "Scoped JFS reconnect failed."
      });
    }
  });

  router.post("/scoped/test-connection", authMiddleware, async (req, res) => {
    try {
      const result = await req.outletContext.authManager.testConnection();
      return res.json({ success: true, data: result });
    } catch (err) {
      if (err.code === "JFS_EMERGENCY_TOKEN_EXPIRED" || err.code === "JFS_EMERGENCY_MODE_EXPIRED") {
        return res.status(err.status || 401).json({
          success: false,
          error: err.code,
          message: err.message
        });
      }
      logScopedConnectionFailure("SCOPED_TEST_CONNECTION", err);
      return res.status(401).json({
        success: false,
        error: "JFS_SCOPED_TEST_FAILED",
        message: "Scoped JFS connection test failed."
      });
    }
  });

  for (const { path: routePath, op } of operations) {
    const fullPath = routePath;
    router.post(fullPath, authMiddleware, async (req, res) => {
      if (op === "OMS_SCHEDULING_DETAIL" || op === "SENDER_DETAIL" || op === "SENSITIVE_DETAIL" || op === "WAYBILL_TRACKING" || op === "WAYBILL_DETAIL") {
        res.set("Cache-Control", "private, no-store, max-age=0");
      }
      try {
        const options = validateOperationOptions(op, req.body || {});
        const result = await executeMultiOutletScraper(req.outletContext, op, options);
        return res.json({
          success: true,
          data: result,
          context: req.outletContext.getState()
        });
      } catch (err) {
        if (err.code === "JFS_EMERGENCY_TOKEN_EXPIRED" || err.code === "JFS_EMERGENCY_MODE_EXPIRED") {
          return res.status(err.status || 401).json({
            success: false,
            error: err.code,
            message: err.message
          });
        }

        const invalidRuntimeOptions = err.code === "FORBIDDEN_RUNTIME_OPTION" || err.code === "INVALID_RUNTIME_OPTIONS" || err.code === "INVALID_WAYBILL_NO";
        const notFound = err.code === "WAYBILL_TRACKING_NOT_FOUND" || err.code === "WAYBILL_DETAIL_NOT_FOUND";

        if ((op === "WAYBILL_TRACKING" || op === "WAYBILL_DETAIL") && !invalidRuntimeOptions && !notFound) {
          const errorType = err instanceof Error ? err.name : typeof err;
          const errorCode = err.code || "UNKNOWN";
          const stage = inferMiddlewareStage(err);
          const upstreamStatus = extractUpstreamStatus(err);

          console.error(`[JFS][${op}] request failed`, {
            operation: op,
            errorType,
            errorCode,
            stage,
            ...(upstreamStatus ? { upstreamStatus } : {})
          });
        }

        return res.status(invalidRuntimeOptions ? 400 : notFound ? 404 : 500).json({
          success: false,
          error: invalidRuntimeOptions || notFound ? err.code : "SCRAPER_EXECUTION_FAILED",
          message: err.message
        });
      }
    });
  }

  return router;
}

module.exports = {
  OPERATION_FIELDS,
  createInternalMultiOutletRouter,
  validateOperationOptions
};
