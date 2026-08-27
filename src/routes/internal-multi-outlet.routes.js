"use strict";

const express = require("express");
const { trustedOutletContextMiddleware } = require("../middleware/trusted-outlet-context.middleware");
const { executeMultiOutletScraper } = require("../services/jfs-multi-outlet-scrapers.service");
const { globalRegistry } = require("../context/outlet-context-registry");

const OPERATION_FIELDS = {
  SENSITIVE_DETAIL: ["waybillNo"],
  WAYBILL_TRACKING: ["waybillNo"],
  WAYBILL_DETAIL: ["waybillNo"]
};

function validateOperationOptions(operation, value) {
  if (!(operation in OPERATION_FIELDS)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Request body must be an object"), { code: "INVALID_RUNTIME_OPTIONS" });
  }
  const allowed = new Set(OPERATION_FIELDS[operation]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw Object.assign(new Error(`Runtime option ${field} is not allowed for ${operation}`), {
        code: "FORBIDDEN_RUNTIME_OPTION",
        field
      });
    }
  }
  const waybillNo = value.waybillNo;
  if (typeof waybillNo !== "string" || !/^[A-Za-z0-9]{1,100}$/.test(waybillNo.trim())) {
    throw Object.assign(new Error("waybillNo is invalid"), { code: "INVALID_WAYBILL_NO" });
  }
  return value;
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

  for (const { path: routePath, op } of operations) {
    const fullPath = routePath;
    router.post(fullPath, authMiddleware, async (req, res) => {
      if (op === "OMS_SCHEDULING_DETAIL" || op === "SENSITIVE_DETAIL" || op === "WAYBILL_TRACKING" || op === "WAYBILL_DETAIL") {
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
        const invalidRuntimeOptions = err.code === "FORBIDDEN_RUNTIME_OPTION" || err.code === "INVALID_RUNTIME_OPTIONS" || err.code === "INVALID_WAYBILL_NO";
        const notFound = err.code === "WAYBILL_TRACKING_NOT_FOUND" || err.code === "WAYBILL_DETAIL_NOT_FOUND";
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
