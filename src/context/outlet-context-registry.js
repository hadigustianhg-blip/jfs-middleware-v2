"use strict";

const { createJfsOutletContext } = require("./jfs-outlet-context");

class OutletContextRegistry {
  constructor() {
    this.contexts = new Map();
  }

  buildKey(tenantId, outletId) {
    return `${tenantId}:${outletId}`;
  }

  register(options) {
    const key = this.buildKey(options.tenantId, options.outletId);
    const context = createJfsOutletContext(options);
    this.contexts.set(key, context);
    return context;
  }

  get(tenantId, outletId) {
    const key = this.buildKey(tenantId, outletId);
    return this.contexts.get(key) || null;
  }

  has(tenantId, outletId) {
    const key = this.buildKey(tenantId, outletId);
    return this.contexts.has(key);
  }

  remove(tenantId, outletId) {
    const key = this.buildKey(tenantId, outletId);
    return this.contexts.delete(key);
  }

  clear() {
    this.contexts.clear();
  }

  size() {
    return this.contexts.size;
  }
}

const globalRegistry = new OutletContextRegistry();

module.exports = {
  OutletContextRegistry,
  globalRegistry
};
