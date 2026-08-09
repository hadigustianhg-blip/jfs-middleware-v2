"use strict";

const { createJfsAuthManager } = require("../auth/jfs-auth-manager");
const { createJfsHttpClient } = require("./jfs-http-client");
const { getOutletConfig } = require("../config/jfs-outlet-config");

class JfsOutletContextError extends Error {
  constructor(message, code = "INVALID_OUTLET_CONTEXT", status = 400) {
    super(message);
    this.name = "JfsOutletContextError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Creates an immutable JfsOutletContext instance holding tenant/outlet metadata,
 * legacy outlet config, isolated authManager, getAuthToken(), and isolated httpClient.
 */
function createJfsOutletContext(options = {}) {
  const { tenantId, outletId, outletCode, initialToken } = options;

  if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
    throw new JfsOutletContextError("tenantId is required", "MISSING_TENANT_ID");
  }

  if (!outletId || typeof outletId !== "string" || !outletId.trim()) {
    throw new JfsOutletContextError("outletId is required", "MISSING_OUTLET_ID");
  }

  if (!outletCode || typeof outletCode !== "string" || !outletCode.trim()) {
    throw new JfsOutletContextError("outletCode is required", "MISSING_OUTLET_CODE");
  }

  const config = options.config
    ? { ...options.config }
    : getOutletConfig();

  if (
    !config.networkCode ||
    !config.financeCode ||
    config.financeId === undefined ||
    !config.scanSiteCode
  ) {
    throw new JfsOutletContextError("Outlet config is incomplete", "INVALID_OUTLET_CONFIG");
  }

  const authManager =
    options.authManager ||
    createJfsAuthManager({
      initialToken: initialToken || ""
    });

  const httpClient =
    options.httpClient ||
    createJfsHttpClient({
      authManager
    });

  const context = Object.freeze({
    tenantId: tenantId.trim(),
    outletId: outletId.trim(),
    outletCode: outletCode.trim(),
    config: Object.freeze({ ...config }),
    authManager,
    getAuthToken() {
      return authManager.getToken();
    },
    httpClient
  });

  return context;
}

module.exports = {
  createJfsOutletContext,
  JfsOutletContextError
};
