"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createJfsAuthManager } = require("../src/auth/jfs-auth-manager");
const {
  bootstrapOutletContexts,
  resolveTrustedOutletContext,
  extractContextKeyFromHeaders,
  resolveContextFromRequest,
  createOutletContextRegistry,
  ContextBootstrapError,
  ContextResolverError
} = require("../src/context");

test("TEST A & B & C: Bootstrap Context A & B and resolve internal-key-a and internal-key-b", () => {
  const definitions = [
    {
      key: "internal-key-a",
      tenantId: "TENANT_1",
      outletId: "OUTLET_A_ID",
      outletCode: "SUM001A",
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A",
      initialToken: "TEST_TOKEN_A"
    },
    {
      key: "internal-key-b",
      tenantId: "TENANT_1",
      outletId: "OUTLET_B_ID",
      outletCode: "SUM002A",
      networkCode: "SUM002A",
      financeCode: "JKT999",
      financeId: 555,
      scanSiteCode: "SUM002A",
      initialToken: "TEST_TOKEN_B"
    }
  ];

  const { registry, count } = bootstrapOutletContexts({ definitions });
  assert.equal(count, 2);

  const contextA = resolveTrustedOutletContext("internal-key-a", registry);
  assert.equal(contextA.tenantId, "TENANT_1");
  assert.equal(contextA.outletId, "OUTLET_A_ID");
  assert.equal(contextA.outletCode, "SUM001A");
  assert.equal(contextA.getAuthToken(), "TEST_TOKEN_A");

  const contextB = resolveTrustedOutletContext("internal-key-b", registry);
  assert.equal(contextB.tenantId, "TENANT_1");
  assert.equal(contextB.outletId, "OUTLET_B_ID");
  assert.equal(contextB.outletCode, "SUM002A");
  assert.equal(contextB.getAuthToken(), "TEST_TOKEN_B");
});

test("TEST D: Unknown key fails closed with UNKNOWN_INTEGRATION_CONTEXT", () => {
  const { registry } = bootstrapOutletContexts({ definitions: [] });
  assert.throws(
    () => resolveTrustedOutletContext("unknown-key-xyz", registry),
    {
      name: "ContextResolverError",
      code: "UNKNOWN_INTEGRATION_CONTEXT",
      status: 404
    }
  );
});

test("TEST E: Empty/missing key fails closed with MISSING_INTEGRATION_CONTEXT", () => {
  const { registry } = bootstrapOutletContexts({ definitions: [] });
  assert.throws(
    () => resolveTrustedOutletContext("", registry),
    {
      name: "ContextResolverError",
      code: "MISSING_INTEGRATION_CONTEXT",
      status: 400
    }
  );
  assert.throws(
    () => resolveTrustedOutletContext(null, registry),
    {
      name: "ContextResolverError",
      code: "MISSING_INTEGRATION_CONTEXT",
      status: 400
    }
  );
});

test("TEST F: Duplicate key during bootstrap is rejected", () => {
  const definitions = [
    {
      key: "duplicate-key-1",
      tenantId: "TENANT_1",
      outletId: "OUTLET_A_ID",
      outletCode: "SUM001A",
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A",
      initialToken: "TOKEN_A"
    },
    {
      key: "duplicate-key-1",
      tenantId: "TENANT_1",
      outletId: "OUTLET_B_ID",
      outletCode: "SUM002A",
      networkCode: "SUM002A",
      financeCode: "JKT999",
      financeId: 555,
      scanSiteCode: "SUM002A",
      initialToken: "TOKEN_B"
    }
  ];

  assert.throws(
    () => bootstrapOutletContexts({ definitions }),
    {
      name: "OutletRegistryError",
      code: "DUPLICATE_OUTLET_CONTEXT"
    }
  );
});

test("TEST G & H: Context A and B have distinct authManager and httpClient instances", () => {
  const definitions = [
    {
      key: "key-a",
      tenantId: "T1",
      outletId: "O1",
      outletCode: "S1",
      networkCode: "S1",
      financeCode: "F1",
      financeId: 1,
      scanSiteCode: "S1",
      initialToken: "TOKEN_A"
    },
    {
      key: "key-b",
      tenantId: "T1",
      outletId: "O2",
      outletCode: "S2",
      networkCode: "S2",
      financeCode: "F2",
      financeId: 2,
      scanSiteCode: "S2",
      initialToken: "TOKEN_B"
    }
  ];

  const { registry } = bootstrapOutletContexts({ definitions });
  const contextA = resolveTrustedOutletContext("key-a", registry);
  const contextB = resolveTrustedOutletContext("key-b", registry);

  assert.notEqual(contextA.authManager, contextB.authManager);
  assert.notEqual(contextA.httpClient, contextB.httpClient);
});

test("TEST I: Concurrent resolve A+B has zero state bleed", async () => {
  const definitions = [
    { key: "key-a", tenantId: "T1", outletId: "O1", outletCode: "S1", networkCode: "S1", financeCode: "F1", financeId: 1, scanSiteCode: "S1", initialToken: "TA" },
    { key: "key-b", tenantId: "T1", outletId: "O2", outletCode: "S2", networkCode: "S2", financeCode: "F2", financeId: 2, scanSiteCode: "S2", initialToken: "TB" }
  ];

  const { registry } = bootstrapOutletContexts({ definitions });

  const resolveOp = async (key) => {
    await new Promise(r => setTimeout(r, 5));
    return resolveTrustedOutletContext(key, registry);
  };

  const [resA, resB] = await Promise.all([resolveOp("key-a"), resolveOp("key-b")]);
  assert.equal(resA.outletCode, "S1");
  assert.equal(resA.getAuthToken(), "TA");
  assert.equal(resB.outletCode, "S2");
  assert.equal(resB.getAuthToken(), "TB");
});

test("TEST J & K: Header resolver reads X-JFS-Context-Key and IGNORES query parameters", () => {
  const definitions = [
    { key: "trusted-key-a", tenantId: "T1", outletId: "O1", outletCode: "SUM001A", networkCode: "SUM001A", financeCode: "F1", financeId: 1, scanSiteCode: "SUM001A", initialToken: "TA" },
    { key: "trusted-key-b", tenantId: "T1", outletId: "O2", outletCode: "SUM002A", networkCode: "SUM002A", financeCode: "F2", financeId: 2, scanSiteCode: "SUM002A", initialToken: "TB" }
  ];

  const { registry } = bootstrapOutletContexts({ definitions });

  // Simulated request with Header = trusted-key-a AND Query = OUTLET-B / trusted-key-b
  const mockReq = {
    headers: {
      "x-jfs-context-key": "trusted-key-a"
    },
    query: {
      outlet: "SUM002A",
      contextKey: "trusted-key-b"
    }
  };

  const resolved = resolveContextFromRequest(mockReq, { registry });
  // Must strictly select Context A, query params MUST BE IGNORED
  assert.equal(resolved.outletCode, "SUM001A");
  assert.equal(resolved.outletId, "O1");
});

test("TEST L: Sensitive context keys/tokens do not leak in error objects", () => {
  const { registry } = bootstrapOutletContexts({ definitions: [] });
  try {
    resolveTrustedOutletContext("SECRET_KEY_12345", registry);
    assert.fail("Should have thrown");
  } catch (error) {
    assert.equal(error.code, "UNKNOWN_INTEGRATION_CONTEXT");
    assert.equal(error.message.includes("SECRET_KEY_12345"), false);
  }
});
