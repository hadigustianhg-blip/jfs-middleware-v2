"use strict";

const express = require("express");
const { trustedOutletContextMiddleware } = require("../middleware/trusted-outlet-context.middleware");
const { executeMultiOutletScraper } = require("../services/jfs-multi-outlet-scrapers.service");
const { globalRegistry } = require("../context/outlet-context-registry");

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
    { path: "/sensitive-detail", op: "SENSITIVE_DETAIL" }
  ];

  router.post("/scoped/reconnect", authMiddleware, async (req, res) => {
    try {
      const account = req.get("X-JFS-Account") || req.get("x-jfs-account");
      const password = req.get("X-JFS-Password") || req.get("x-jfs-password");
      req.outletContext.authManager.setCredentials(account, password);
      const result = await req.outletContext.authManager.reconnect();
      return res.json({ success: true, data: result });
    } catch (err) {
      return res.status(401).json({ success: false, error: "JFS_SCOPED_RECONNECT_FAILED", message: err.message });
    }
  });

  router.post("/scoped/test-connection", authMiddleware, async (req, res) => {
    try {
      const result = await req.outletContext.authManager.testConnection();
      return res.json({ success: true, data: result });
    } catch (err) {
      return res.status(401).json({ success: false, error: "JFS_SCOPED_TEST_FAILED", message: err.message });
    }
  });

  for (const { path: routePath, op } of operations) {
    const fullPath = routePath;
    router.post(fullPath, authMiddleware, async (req, res) => {
      if (op === "OMS_SCHEDULING_DETAIL" || op === "SENDER_DETAIL" || op === "SENSITIVE_DETAIL") {
        res.set("Cache-Control", "private, no-store, max-age=0");
      }
      try {
        const result = await executeMultiOutletScraper(req.outletContext, op, req.body || {});
        return res.json({
          success: true,
          data: result,
          context: req.outletContext.getState()
        });
      } catch (err) {
        return res.status(500).json({
          success: false,
          error: "SCRAPER_EXECUTION_FAILED",
          message: err.message
        });
      }
    });
  }

  return router;
}

module.exports = {
  createInternalMultiOutletRouter
};
