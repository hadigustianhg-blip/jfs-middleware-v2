"use strict";

const { safeKeyMatches } = require("../controllers/jfs-auth.controller");
const { globalRegistry } = require("../context/outlet-context-registry");

function trustedOutletContextMiddleware({
  getAuthKey = () => process.env.JFS_AUTH_KEY || "",
  registry = globalRegistry
} = {}) {
  return async function middleware(req, res, next) {
    const receivedAuthKey =
      req.get("X-Auth-Key") ||
      req.get("x-auth-key") ||
      req.headers["x-auth-key"] ||
      "";
    const expectedAuthKey = getAuthKey();

    if (!safeKeyMatches(receivedAuthKey, expectedAuthKey)) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Invalid or missing X-Auth-Key"
      });
    }

    const tenantId = req.get("X-JFS-Tenant-Id") || req.get("x-jfs-tenant-id");
    const outletId = req.get("X-JFS-Outlet-Id") || req.get("x-jfs-outlet-id");
    const outletCode = req.get("X-JFS-Outlet-Code") || req.get("x-jfs-outlet-code");

    if (!tenantId || !outletId || !outletCode) {
      return res.status(400).json({
        success: false,
        error: "MISSING_OUTLET_IDENTITY",
        message: "X-JFS-Tenant-Id, X-JFS-Outlet-Id, and X-JFS-Outlet-Code are required"
      });
    }

    let context = registry.get(tenantId, outletId);

    if (!context) {
      const account = req.get("X-JFS-Account") || req.get("x-jfs-account");
      const password = req.get("X-JFS-Password") || req.get("x-jfs-password");
      const networkCode = req.get("X-JFS-Network-Code") || req.get("x-jfs-network-code") || outletCode;

      if (!account || !password) {
        return res.status(400).json({
          success: false,
          error: "CONTEXT_NOT_BOOTSTRAPPED",
          message: `Outlet context ${tenantId}:${outletId} is not bootstrapped and credentials were not provided.`
        });
      }

      context = registry.register({
        tenantId,
        outletId,
        outletCode,
        networkCode,
        account,
        password
      });
    }

    req.outletContext = context;
    return next();
  };
}

module.exports = {
  trustedOutletContextMiddleware
};
