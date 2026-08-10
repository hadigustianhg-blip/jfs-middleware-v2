"use strict";

const { createJfsOutletContext } = require("./jfs-outlet-context");
const { createOutletContextRegistry } = require("./outlet-context-registry");
const { createJfsAuthManager } = require("../auth/jfs-auth-manager");
const { createJfsHttpClient } = require("./jfs-http-client");
const { resolveContextCredential } = require("./credential-resolver");

class ContextBootstrapError extends Error {
  constructor(message, code = "INVALID_BOOTSTRAP_DEFINITION", status = 400) {
    super(message);
    this.name = "ContextBootstrapError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Parses JSON env configuration into context definitions safely.
 */
function parseContextDefinitionsFromEnv(envValue = process.env.JFS_CONTEXTS_JSON) {
  if (!envValue || typeof envValue !== "string" || !envValue.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(envValue);
    if (!Array.isArray(parsed)) {
      throw new ContextBootstrapError("JFS_CONTEXTS_JSON must be a JSON array", "INVALID_JSON_CONFIG");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ContextBootstrapError) throw error;
    throw new ContextBootstrapError("Failed to parse JFS_CONTEXTS_JSON", "INVALID_JSON_CONFIG");
  }
}

/**
 * Bootstraps isolated JfsOutletContext instances from definitions into an OutletContextRegistry.
 * Resolves secret tokens via resolveContextCredential using definition.credentialRef.
 */
function bootstrapOutletContexts(options = {}) {
  const definitions = options.definitions || parseContextDefinitionsFromEnv(options.envValue);
  const registry = options.registry || createOutletContextRegistry();
  const authManagerFactory = options.createAuthManager || createJfsAuthManager;
  const httpClientFactory = options.createHttpClient || createJfsHttpClient;
  const env = options.env || process.env;
  const allowInitialTokenFallback = options.allowInitialTokenFallback ?? false;

  if (!Array.isArray(definitions)) {
    throw new ContextBootstrapError("definitions must be an array", "INVALID_DEFINITIONS");
  }

  const bootstrapped = [];

  for (const def of definitions) {
    if (!def || typeof def !== "object") {
      throw new ContextBootstrapError("Definition must be an object", "INVALID_DEFINITION");
    }

    const key = def.key ? String(def.key).trim() : (def.outletId ? String(def.outletId).trim() : "");
    if (!key) {
      throw new ContextBootstrapError("Context definition key is required", "MISSING_CONTEXT_KEY");
    }

    const tenantId = def.tenantId ? String(def.tenantId).trim() : "";
    const outletId = def.outletId ? String(def.outletId).trim() : "";
    const outletCode = def.outletCode ? String(def.outletCode).trim() : "";

    if (!tenantId || !outletId || !outletCode) {
      throw new ContextBootstrapError(
        `Context definition for key "${key}" must contain tenantId, outletId, and outletCode`,
        "INCOMPLETE_CONTEXT_DEFINITION"
      );
    }

    const networkCode = def.networkCode || outletCode;
    const financeCode = def.financeCode || "";
    const financeId = def.financeId !== undefined ? Number(def.financeId) : undefined;
    const scanSiteCode = def.scanSiteCode || outletCode;

    if (!networkCode || !financeCode || financeId === undefined || !scanSiteCode || !Number.isFinite(financeId)) {
      throw new ContextBootstrapError(
        `Context definition for key "${key}" has invalid or missing config parameters`,
        "INVALID_OUTLET_CONFIG"
      );
    }

    // Resolve Secret Token via CredentialRef
    let initialToken = "";
    if (def.credentialRef) {
      try {
        initialToken = resolveContextCredential(def.credentialRef, env);
      } catch (err) {
        throw new ContextBootstrapError(err.message, err.code, err.status);
      }
    } else if (def.initialToken) {
      initialToken = String(def.initialToken).trim();
    } else {
      throw new ContextBootstrapError(
        `Context definition for key "${key}" must contain a valid credentialRef`,
        "MISSING_CREDENTIAL_REFERENCE"
      );
    }

    const config = {
      networkCode,
      financeCode,
      financeId,
      scanSiteCode
    };

    const authManager = authManagerFactory({
      initialToken
    });

    const httpClient = httpClientFactory({
      authManager
    });

    const context = createJfsOutletContext({
      tenantId,
      outletId,
      outletCode,
      config,
      authManager,
      httpClient
    });

    // Register into registry using key
    registry.registerOutletContext(context, key);
    bootstrapped.push({ key, context });
  }

  return {
    registry,
    bootstrapped,
    count: bootstrapped.length
  };
}

module.exports = {
  bootstrapOutletContexts,
  parseContextDefinitionsFromEnv,
  ContextBootstrapError
};
