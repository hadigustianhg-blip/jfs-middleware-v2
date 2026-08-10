"use strict";

const { createJfsOutletContext } = require("./jfs-outlet-context");

class OutletContextRegistry {
  constructor({ maxIdleMs = 2 * 60 * 60 * 1000, maxCapacity = 500 } = {}) {
    this.contexts = new Map();
    this.maxIdleMs = maxIdleMs;
    this.maxCapacity = maxCapacity;
  }

  buildKey(tenantId, outletId) {
    return `${tenantId}:${outletId}`;
  }

  register(options) {
    this.evictIdle();
    if (this.contexts.size >= this.maxCapacity) {
      this.evictOldestIdle();
    }

    const key = this.buildKey(options.tenantId, options.outletId);
    const context = createJfsOutletContext(options);
    const entry = {
      context,
      lastAccessedAt: Date.now()
    };
    this.contexts.set(key, entry);
    return context;
  }

  get(tenantId, outletId) {
    const key = this.buildKey(tenantId, outletId);
    const entry = this.contexts.get(key);
    if (!entry) return null;

    // Check if entry has expired due to idle TTL
    if (Date.now() - entry.lastAccessedAt > this.maxIdleMs) {
      this.contexts.delete(key);
      return null;
    }

    entry.lastAccessedAt = Date.now();
    return entry.context;
  }

  has(tenantId, outletId) {
    return this.get(tenantId, outletId) !== null;
  }

  remove(tenantId, outletId) {
    const key = this.buildKey(tenantId, outletId);
    return this.contexts.delete(key);
  }

  evictIdle(customMaxIdleMs = this.maxIdleMs) {
    const now = Date.now();
    for (const [key, entry] of this.contexts.entries()) {
      if (now - entry.lastAccessedAt > customMaxIdleMs) {
        this.contexts.delete(key);
      }
    }
  }

  evictOldestIdle() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.contexts.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.contexts.delete(oldestKey);
    }
  }

  clear() {
    this.contexts.clear();
  }

  size() {
    this.evictIdle();
    return this.contexts.size;
  }
}

const globalRegistry = new OutletContextRegistry();

module.exports = {
  OutletContextRegistry,
  globalRegistry
};
