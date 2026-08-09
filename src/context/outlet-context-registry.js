"use strict";

class OutletRegistryError extends Error {
  constructor(message, code = "OUTLET_REGISTRY_ERROR", status = 400) {
    super(message);
    this.name = "OutletRegistryError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Creates an in-memory registry for JfsOutletContext instances.
 * Enforces key resolution, duplicate rejection, and tenant/outlet consistency.
 */
function createOutletContextRegistry() {
  const contexts = new Map();

  function resolveKey(contextOrKey, explicitKey) {
    if (explicitKey && typeof explicitKey === "string" && explicitKey.trim()) {
      return explicitKey.trim();
    }
    if (contextOrKey && typeof contextOrKey === "object" && contextOrKey.outletId) {
      return String(contextOrKey.outletId).trim();
    }
    return String(contextOrKey || "").trim();
  }

  function registerOutletContext(context, explicitKey) {
    if (!context || typeof context !== "object") {
      throw new OutletRegistryError("Invalid context object", "INVALID_CONTEXT");
    }

    if (!context.tenantId || !context.outletId || !context.outletCode) {
      throw new OutletRegistryError(
        "Context must have tenantId, outletId, and outletCode",
        "INCOMPLETE_CONTEXT"
      );
    }

    const key = resolveKey(context, explicitKey);
    if (!key) {
      throw new OutletRegistryError("Registry key cannot be empty", "INVALID_REGISTRY_KEY");
    }

    if (contexts.has(key)) {
      throw new OutletRegistryError(
        `Outlet context for key "${key}" is already registered`,
        "DUPLICATE_OUTLET_CONTEXT",
        409
      );
    }

    contexts.set(key, context);
    return context;
  }

  function getOutletContext(key) {
    const lookupKey = resolveKey(null, key);
    if (!lookupKey) {
      return null;
    }
    return contexts.get(lookupKey) || null;
  }

  function hasOutletContext(key) {
    const lookupKey = resolveKey(null, key);
    if (!lookupKey) {
      return false;
    }
    return contexts.has(lookupKey);
  }

  function unregisterOutletContext(key) {
    const lookupKey = resolveKey(null, key);
    if (lookupKey) {
      return contexts.delete(lookupKey);
    }
    return false;
  }

  function clear() {
    contexts.clear();
  }

  function size() {
    return contexts.size;
  }

  return {
    registerOutletContext,
    getOutletContext,
    hasOutletContext,
    unregisterOutletContext,
    clear,
    size
  };
}

const globalRegistry = createOutletContextRegistry();

module.exports = {
  createOutletContextRegistry,
  globalRegistry,
  OutletRegistryError
};
