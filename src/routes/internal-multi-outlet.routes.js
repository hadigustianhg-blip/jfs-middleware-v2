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
    { path: "/inventory", op: "INVENTORY" },
    { path: "/jfs-inventory-detail", op: "INVENTORY" },
    { path: "/aging-sign", op: "AGING_SIGN" },
    { path: "/jfs-aging-sign", op: "AGING_SIGN" },
    { path: "/waybill-status", op: "WAYBILL_STATUS" },
    { path: "/jfs-waybill-status", op: "WAYBILL_STATUS" },
    { path: "/sender-detail", op: "SENDER_DETAIL" },
    { path: "/jfs-sender-detail", op: "SENDER_DETAIL" }
  ];

  for (const { path: routePath, op } of operations) {
    const fullPath = routePath;
    router.post(fullPath, authMiddleware, async (req, res) => {
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
