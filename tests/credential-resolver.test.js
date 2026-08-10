"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveContextCredential,
  bootstrapOutletContexts,
  resolveTrustedOutletContext,
  CredentialResolverError,
  ContextBootstrapError
} = require("../src/context");

test("TEST A & B & C: Context A and B resolve distinct tokens from controlled env secrets via credentialRef", () => {
  const env = {
    JFS_CONTEXT_TOKEN_SUM001A: "SECRET_TOKEN_SUM001A",
    JFS_CONTEXT_TOKEN_SUM002A: "SECRET_TOKEN_SUM002A"
  };

  const tokenA = resolveContextCredential("SUM001A", env);
  const tokenB = resolveContextCredential("SUM002A", env);

  assert.equal(tokenA, "SECRET_TOKEN_SUM001A");
  assert.equal(tokenB, "SECRET_TOKEN_SUM002A");
  assert.notEqual(tokenA, tokenB);

  const definitions = [
    {
      key: "key-a",
      tenantId: "t1",
      outletId: "o1",
      outletCode: "SUM001A",
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A",
      credentialRef: "SUM001A"
    },
    {
      key: "key-b",
      tenantId: "t1",
      outletId: "o2",
      outletCode: "SUM002A",
      networkCode: "SUM002A",
      financeCode: "JKT999",
      financeId: 555,
      scanSiteCode: "SUM002A",
      credentialRef: "SUM002A"
    }
  ];

  const { registry } = bootstrapOutletContexts({ definitions, env });
  const contextA = resolveTrustedOutletContext("key-a", registry);
  const contextB = resolveTrustedOutletContext("key-b", registry);

  assert.equal(contextA.getAuthToken(), "SECRET_TOKEN_SUM001A");
  assert.equal(contextB.getAuthToken(), "SECRET_TOKEN_SUM002A");
});

test("TEST D: Missing/empty credentialRef fails closed with MISSING_CREDENTIAL_REFERENCE", () => {
  assert.throws(
    () => resolveContextCredential("", {}),
    {
      name: "CredentialResolverError",
      code: "MISSING_CREDENTIAL_REFERENCE",
      status: 400
    }
  );
  assert.throws(
    () => resolveContextCredential(null, {}),
    {
      name: "CredentialResolverError",
      code: "MISSING_CREDENTIAL_REFERENCE",
      status: 400
    }
  );
});

test("TEST E: Invalid characters in credentialRef fails closed with INVALID_CREDENTIAL_REFERENCE", () => {
  assert.throws(
    () => resolveContextCredential("SUM 001! @#$", {}),
    {
      name: "CredentialResolverError",
      code: "INVALID_CREDENTIAL_REFERENCE",
      status: 400
    }
  );
});

test("TEST F: Missing secret env for Context A fails closed with MISSING_CONTEXT_CREDENTIAL", () => {
  const env = {};
  assert.throws(
    () => resolveContextCredential("SUM001A", env),
    {
      name: "CredentialResolverError",
      code: "MISSING_CONTEXT_CREDENTIAL",
      status: 500
    }
  );
});

test("TEST G: Missing secret env for Context B fails only B and does NOT fall back to Context A token", () => {
  const env = {
    JFS_CONTEXT_TOKEN_SUM001A: "SECRET_TOKEN_SUM001A"
  };

  const tokenA = resolveContextCredential("SUM001A", env);
  assert.equal(tokenA, "SECRET_TOKEN_SUM001A");

  assert.throws(
    () => resolveContextCredential("SUM002A", env),
    {
      name: "CredentialResolverError",
      code: "MISSING_CONTEXT_CREDENTIAL"
    }
  );
});

test("TEST H: credentialRef attempting arbitrary env lookup is prevented by controlled prefix", () => {
  const env = {
    DATABASE_URL: "postgres://secret-db-url",
    SECRET_KEY: "super-secret-key",
    JFS_CONTEXT_TOKEN_SUM001A: "VALID_JFS_TOKEN"
  };

  // Attempting credentialRef = "DATABASE_URL" looks up JFS_CONTEXT_TOKEN_DATABASE_URL
  assert.throws(
    () => resolveContextCredential("DATABASE_URL", env),
    {
      name: "CredentialResolverError",
      code: "MISSING_CONTEXT_CREDENTIAL"
    }
  );
});

test("TEST I: Token does NOT appear in JSON serialization of context or definition", () => {
  const env = {
    JFS_CONTEXT_TOKEN_SUM001A: "SENSITIVE_SECRET_TOKEN_12345"
  };

  const definitions = [
    {
      key: "key-a",
      tenantId: "t1",
      outletId: "o1",
      outletCode: "SUM001A",
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A",
      credentialRef: "SUM001A"
    }
  ];

  const { registry } = bootstrapOutletContexts({ definitions, env });
  const contextA = resolveTrustedOutletContext("key-a", registry);

  const defSerialized = JSON.stringify(definitions[0]);
  const contextSerialized = JSON.stringify(contextA);

  assert.equal(defSerialized.includes("SENSITIVE_SECRET_TOKEN_12345"), false);
  assert.equal(contextSerialized.includes("SENSITIVE_SECRET_TOKEN_12345"), false);
});

test("TEST J: Error responses and logs do NOT expose secret tokens", () => {
  const env = {};
  try {
    resolveContextCredential("SUM001A", env);
    assert.fail("Should have thrown");
  } catch (error) {
    const errorStr = JSON.stringify(error);
    assert.equal(errorStr.includes("SENSITIVE"), false);
    assert.equal(error.code, "MISSING_CONTEXT_CREDENTIAL");
  }
});
