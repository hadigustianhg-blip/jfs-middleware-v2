"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createJfsAuthManager } = require("../src/auth/jfs-auth-manager");
const {
  createJfsOutletContext,
  createOutletContextRegistry,
  createJfsHttpClient,
  assertExpectedNetworkCode,
  JfsNetworkMismatchError,
  OutletRegistryError
} = require("../src/context");

test("TEST 1: Register Outlet A and resolve Outlet A", () => {
  const registry = createOutletContextRegistry();
  const authManagerA = createJfsAuthManager({ initialToken: "TOKEN_OUTLET_A" });

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    config: {
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A"
    },
    authManager: authManagerA
  });

  registry.registerOutletContext(contextA);

  const resolved = registry.getOutletContext("OUTLET_A_ID");
  assert.equal(resolved, contextA);
  assert.equal(resolved.tenantId, "TENANT_1");
  assert.equal(resolved.outletId, "OUTLET_A_ID");
  assert.equal(resolved.outletCode, "SUM001A");
  assert.equal(resolved.getAuthToken(), "TOKEN_OUTLET_A");
});

test("TEST 2: Register Outlet A and Outlet B with distinct configs", () => {
  const registry = createOutletContextRegistry();

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    config: {
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A"
    }
  });

  const contextB = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_B_ID",
    outletCode: "SUM002A",
    config: {
      networkCode: "SUM002A",
      financeCode: "JKT999",
      financeId: 555,
      scanSiteCode: "SUM002A"
    }
  });

  registry.registerOutletContext(contextA);
  registry.registerOutletContext(contextB);

  const resolvedA = registry.getOutletContext("OUTLET_A_ID");
  const resolvedB = registry.getOutletContext("OUTLET_B_ID");

  assert.equal(resolvedA.config.networkCode, "SUM001A");
  assert.equal(resolvedA.config.financeId, 183);

  assert.equal(resolvedB.config.networkCode, "SUM002A");
  assert.equal(resolvedB.config.financeId, 555);
  assert.notDeepEqual(resolvedA.config, resolvedB.config);
});

test("TEST 3: Token A and Token B are distinct and getAuthToken() returns correct tokens", () => {
  const authManagerA = createJfsAuthManager({ initialToken: "SECRET_TOKEN_A" });
  const authManagerB = createJfsAuthManager({ initialToken: "SECRET_TOKEN_B" });

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    authManager: authManagerA
  });

  const contextB = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_B_ID",
    outletCode: "SUM002A",
    authManager: authManagerB
  });

  assert.equal(contextA.getAuthToken(), "SECRET_TOKEN_A");
  assert.equal(contextB.getAuthToken(), "SECRET_TOKEN_B");
  assert.notEqual(contextA.getAuthToken(), contextB.getAuthToken());
});

test("TEST 4: Refresh/update token A does not affect Token B", () => {
  const authManagerA = createJfsAuthManager({ initialToken: "ORIGINAL_TOKEN_A" });
  const authManagerB = createJfsAuthManager({ initialToken: "ORIGINAL_TOKEN_B" });

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    authManager: authManagerA
  });

  const contextB = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_B_ID",
    outletCode: "SUM002A",
    authManager: authManagerB
  });

  authManagerA.setToken("UPDATED_TOKEN_A_NEW");

  assert.equal(contextA.getAuthToken(), "UPDATED_TOKEN_A_NEW");
  assert.equal(contextB.getAuthToken(), "ORIGINAL_TOKEN_B");
});

test("TEST 5: HTTP client A and B are distinct instances", () => {
  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A"
  });

  const contextB = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_B_ID",
    outletCode: "SUM002A"
  });

  assert.notEqual(contextA.httpClient, contextB.httpClient);
});

test("TEST 6: 401 retry on client A uses authManager A and does not touch authManager B", async () => {
  let loginCountA = 0;
  let loginCountB = 0;

  const authManagerA = createJfsAuthManager({
    initialToken: "EXPIRED_TOKEN_A",
    requestFn: async () => {
      loginCountA++;
      return { data: { data: { token: "REFRESHED_TOKEN_A" } } };
    }
  });
  await authManagerA.loginWithCredentials("USER_A", "PASS_A");
  authManagerA.setToken("EXPIRED_TOKEN_A");

  const authManagerB = createJfsAuthManager({
    initialToken: "VALID_TOKEN_B",
    requestFn: async () => {
      loginCountB++;
      return { data: { data: { token: "REFRESHED_TOKEN_B" } } };
    }
  });
  await authManagerB.loginWithCredentials("USER_B", "PASS_B");
  authManagerB.setToken("VALID_TOKEN_B");
  // Reset count from initial login
  loginCountA = 0;
  loginCountB = 0;

  // Setup local mock HTTP server that returns 401 on first request and 200 on retry
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount++;
    if (requestCount === 1) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 401, message: "Token expired" }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "OK", token: req.headers.authtoken || req.headers.Authtoken }));
    }
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;

  try {
    const httpClientA = createJfsHttpClient({ authManager: authManagerA, baseURL });
    const httpClientB = createJfsHttpClient({ authManager: authManagerB, baseURL });

    const contextA = createJfsOutletContext({
      tenantId: "TENANT_1",
      outletId: "OUTLET_A_ID",
      outletCode: "SUM001A",
      authManager: authManagerA,
      httpClient: httpClientA
    });

    const contextB = createJfsOutletContext({
      tenantId: "TENANT_1",
      outletId: "OUTLET_B_ID",
      outletCode: "SUM002A",
      authManager: authManagerB,
      httpClient: httpClientB
    });

    const response = await contextA.httpClient.get("/test", {
      headers: { Authtoken: contextA.getAuthToken() }
    });

    assert.equal(response.status, 200);
    assert.equal(loginCountA, 1);
    assert.equal(loginCountB, 0);
    assert.equal(contextA.getAuthToken(), "REFRESHED_TOKEN_A");
    assert.equal(contextB.getAuthToken(), "VALID_TOKEN_B");
  } finally {
    server.close();
  }
});

test("TEST 7: Concurrent Promise.all operations A + B keep tokens and configs isolated", async () => {
  const authManagerA = createJfsAuthManager({ initialToken: "TOKEN_CONCURRENT_A" });
  const authManagerB = createJfsAuthManager({ initialToken: "TOKEN_CONCURRENT_B" });

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    config: {
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A"
    },
    authManager: authManagerA
  });

  const contextB = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_B_ID",
    outletCode: "SUM002A",
    config: {
      networkCode: "SUM002A",
      financeCode: "JKT999",
      financeId: 555,
      scanSiteCode: "SUM002A"
    },
    authManager: authManagerB
  });

  const runOperation = async (context) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      token: context.getAuthToken(),
      networkCode: context.config.networkCode,
      financeId: context.config.financeId
    };
  };

  const [resA, resB] = await Promise.all([
    runOperation(contextA),
    runOperation(contextB)
  ]);

  assert.equal(resA.token, "TOKEN_CONCURRENT_A");
  assert.equal(resA.networkCode, "SUM001A");
  assert.equal(resA.financeId, 183);

  assert.equal(resB.token, "TOKEN_CONCURRENT_B");
  assert.equal(resB.networkCode, "SUM002A");
  assert.equal(resB.financeId, 555);
});

test("TEST 8: Duplicate registration is rejected", () => {
  const registry = createOutletContextRegistry();
  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A"
  });

  registry.registerOutletContext(contextA);

  assert.throws(
    () => registry.registerOutletContext(contextA),
    {
      name: "OutletRegistryError",
      code: "DUPLICATE_OUTLET_CONTEXT",
      status: 409
    }
  );
});

test("TEST 9: Unknown context is safely rejected (returns null)", () => {
  const registry = createOutletContextRegistry();
  const resolved = registry.getOutletContext("UNKNOWN_OUTLET_ID");
  assert.equal(resolved, null);
  assert.equal(registry.hasOutletContext("UNKNOWN_OUTLET_ID"), false);
});

test("TEST 10: Network code validation helper works as expected", () => {
  assert.equal(assertExpectedNetworkCode("SUM001A", "SUM001A"), true);
  assert.equal(assertExpectedNetworkCode(null, "ANYTHING"), true);

  assert.throws(
    () => assertExpectedNetworkCode("SUM001A", "CLIENT001"),
    {
      name: "JfsNetworkMismatchError",
      code: "JFS_NETWORK_MISMATCH",
      status: 400
    }
  );

  assert.throws(
    () => assertExpectedNetworkCode("SUM001A", ""),
    {
      name: "JfsNetworkMismatchError",
      code: "JFS_NETWORK_MISMATCH"
    }
  );
});
