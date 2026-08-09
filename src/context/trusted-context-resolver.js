"use strict";

const logger = require("../utils/logger");

class ContextResolverError extends Error {
  constructor(message, code = "INVALID_INTEGRATION_CONTEXT", status = 400) {
    super(message);
    this.name = "ContextResolverError";
    this.code = code;
    this.status = status;
  }
}

const CONTEXT_KEY_HEADER = "x-jfs-context-key";
const CALLER_AUTH_HEADER = "x-auth-key";

/**
 * Extracts internal X-JFS-Context-Key header from incoming HTTP request headers.
 * Strictly ignores query parameters to prevent query parameter context override attacks.
 */
function extractContextKeyFromHeaders(headers = {}) {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === CONTEXT_KEY_HEADER) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}

/**
 * Resolves a JfsOutletContext from a trusted internal context key.
 * Fail closed if key is missing or unknown.
 */
function resolveTrustedOutletContext(contextKey, registry) {
  if (!contextKey || typeof contextKey !== "string" || !contextKey.trim()) {
    throw new ContextResolverError(
      "Internal integration context key is missing",
      "MISSING_INTEGRATION_CONTEXT",
      400
    );
  }

  const sanitizedKey = contextKey.trim();
  if (!registry || typeof registry.getOutletContext !== "function") {
    throw new ContextResolverError(
      "Outlet context registry unavailable",
      "REGISTRY_UNAVAILABLE",
      500
    );
  }

  const context = registry.getOutletContext(sanitizedKey);
  if (!context) {
    throw new ContextResolverError(
      "Requested internal integration context key is unknown",
      "UNKNOWN_INTEGRATION_CONTEXT",
      404
    );
  }

  logger.info("Trusted outlet context resolved", {
    tenantId: context.tenantId,
    outletId: context.outletId,
    outletCode: context.outletCode,
    operation: "CONTEXT_RESOLUTION"
  });

  return context;
}

/**
 * Server-side request resolver helper (2-layer security):
 * Layer 1: Caller Auth (X-Auth-Key check if required)
 * Layer 2: Outlet Context Identity (X-JFS-Context-Key resolution from header ONLY)
 */
function resolveContextFromRequest(req, options = {}) {
  const { registry, expectedAuthKey = process.env.JFS_AUTH_KEY } = options;
  const headers = req?.headers || {};

  // Layer 1: Caller Authentication if expectedAuthKey is configured
  if (expectedAuthKey) {
    let callerAuth = null;
    for (const [k, v] of Object.entries(headers)) {
      if (String(k).toLowerCase() === CALLER_AUTH_HEADER) {
        callerAuth = typeof v === "string" ? v.trim() : null;
        break;
      }
    }
    if (!callerAuth || callerAuth !== expectedAuthKey) {
      throw new ContextResolverError("Caller authentication failed", "UNAUTHORIZED_CALLER", 401);
    }
  }

  // Layer 2: Outlet Context Identity from Header ONLY (ignoring query strings)
  const contextKey = extractContextKeyFromHeaders(headers);
  return resolveTrustedOutletContext(contextKey, registry);
}

module.exports = {
  resolveTrustedOutletContext,
  extractContextKeyFromHeaders,
  resolveContextFromRequest,
  ContextResolverError,
  CONTEXT_KEY_HEADER,
  CALLER_AUTH_HEADER
};
