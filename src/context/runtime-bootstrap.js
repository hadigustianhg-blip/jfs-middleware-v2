"use strict";

const { bootstrapOutletContexts, parseContextDefinitionsFromEnv } = require("./trusted-context-bootstrap");
const { createInternalPilotRoutes } = require("../controllers/internal-waybill-status.controller");
const logger = require("../utils/logger");

/**
 * Safe boolean parser for feature flags.
 * Accepts "true", "1", "yes" (case-insensitive, trimmed).
 */
function isMultiOutletEnabled(env = process.env) {
  if (!env || typeof env !== "object") {
    return false;
  }
  const val = String(env.JFS_MULTI_OUTLET_INTERNAL_ENABLED || "").trim().toLowerCase();
  return val === "true" || val === "1" || val === "yes";
}

/**
 * Opt-in runtime bootstrap helper for multi-outlet isolation.
 * FAIL STARTUP if enabled but misconfigured.
 */
function initializeMultiOutletRuntime(app, env = process.env) {
  if (!isMultiOutletEnabled(env)) {
    logger.info("Multi-outlet internal runtime disabled");
    return { enabled: false, registry: null };
  }

  const expectedAuthKey = env.JFS_AUTH_KEY || env.SECRET_INTERNAL_AUTH_KEY;
  if (!expectedAuthKey || !String(expectedAuthKey).trim()) {
    const error = new Error("JFS_AUTH_KEY is required when multi-outlet runtime is enabled");
    error.code = "MISSING_AUTH_KEY";
    error.status = 500;
    throw error;
  }

  const envValue = env.JFS_CONTEXTS_JSON;
  if (!envValue || !String(envValue).trim()) {
    const error = new Error("JFS_CONTEXTS_JSON is required and cannot be empty when multi-outlet runtime is enabled");
    error.code = "INVALID_CONTEXT_CONFIG";
    error.status = 500;
    throw error;
  }

  const definitions = parseContextDefinitionsFromEnv(envValue);
  if (!definitions || !Array.isArray(definitions) || definitions.length === 0) {
    const error = new Error("JFS_CONTEXTS_JSON must contain at least one valid context definition");
    error.code = "INVALID_CONTEXT_CONFIG";
    error.status = 500;
    throw error;
  }

  const { registry, bootstrapped, count } = bootstrapOutletContexts({ definitions });

  if (app && typeof app.use === "function") {
    const internalRouter = createInternalPilotRoutes({
      registry,
      expectedAuthKey: String(expectedAuthKey).trim()
    });
    app.use(internalRouter);
  }

  logger.info("Multi-outlet internal runtime enabled", {
    operation: "RUNTIME_BOOTSTRAP",
    contextCount: count
  });

  return {
    enabled: true,
    registry,
    bootstrapped,
    count
  };
}

module.exports = {
  isMultiOutletEnabled,
  initializeMultiOutletRuntime
};
