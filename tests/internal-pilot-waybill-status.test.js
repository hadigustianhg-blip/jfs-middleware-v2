"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const { createJfsAuthManager } = require("../src/auth/jfs-auth-manager");
const { bootstrapOutletContexts } = require("../src/context");
const { createInternalPilotRoutes } = require("../src/controllers/internal-waybill-status.controller");

function setupTestEnvironment(scrapeOptions = {}) {
  const definitions = [
    {
      key: "internal-key-a",
      tenantId: "tenant-a",
      outletId: "outlet-a",
      outletCode: "SUM001A",
      networkCode: "SUM001A",
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A",
      initialToken: "TOKEN_A"
    },
    {
      key: "internal-key-b",
      tenantId: "tenant-b",
      outletId: "outlet-b",
      outletCode: "SUM002A",
      networkCode: "SUM002A",
      financeCode: "JKT999",
      financeId: 555,
      scanSiteCode: "SUM002A",
      initialToken: "TOKEN_B"
    }
  ];

  const authManagerA = scrapeOptions.authManagerA || createJfsAuthManager({ initialToken: "TOKEN_A" });
  const authManagerB = scrapeOptions.authManagerB || createJfsAuthManager({ initialToken: "TOKEN_B" });

  const { registry } = bootstrapOutletContexts({
    definitions,
    createAuthManager: (options) => {
      if (options.initialToken === "TOKEN_A") return authManagerA;
      if (options.initialToken === "TOKEN_B") return authManagerB;
      return createJfsAuthManager(options);
    }
  });

  const app = express();
  app.use(express.json());
  app.use(createInternalPilotRoutes({
    registry,
    expectedAuthKey: "SECRET_INTERNAL_AUTH_KEY",
    ...scrapeOptions
  }));

  return { app, registry, authManagerA, authManagerB };
}

async function makeRequest(server, path, headers = {}, body = {}) {
  const url = `http://127.0.0.1:${server.address().port}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

test("TEST 1: Valid auth + Context A uses TOKEN_A and config A", async () => {
  let capturedOptions;
  const { app } = setupTestEnvironment({
    scrapeWaybillStatusFn: async (options) => {
      capturedOptions = options;
      return { data: [{ billCode: "WB001" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      {
        "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY",
        "X-JFS-Context-Key": "internal-key-a"
      },
      { waybills: ["WB001"], startDate: "2026-08-01", endDate: "2026-08-01" }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.metadata.outletCode, "SUM001A");
    assert.equal(capturedOptions.authToken, "TOKEN_A");
    assert.equal(capturedOptions.scanSiteCode, "SUM001A");
  } finally {
    server.close();
  }
});

test("TEST 2: Valid auth + Context B uses TOKEN_B and config B", async () => {
  let capturedOptions;
  const { app } = setupTestEnvironment({
    scrapeWaybillStatusFn: async (options) => {
      capturedOptions = options;
      return { data: [{ billCode: "WB002" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      {
        "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY",
        "X-JFS-Context-Key": "internal-key-b"
      },
      { waybills: ["WB002"], startDate: "2026-08-01", endDate: "2026-08-01" }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.metadata.outletCode, "SUM002A");
    assert.equal(capturedOptions.authToken, "TOKEN_B");
    assert.equal(capturedOptions.scanSiteCode, "SUM002A");
  } finally {
    server.close();
  }
});

test("TEST 3: Wrong X-Auth-Key fails closed with 401 UNAUTHORIZED_CALLER and scraper is NOT called", async () => {
  let scraperCalled = false;
  const { app } = setupTestEnvironment({
    scrapeWaybillStatusFn: async () => {
      scraperCalled = true;
      return { data: [] };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      {
        "X-Auth-Key": "WRONG_AUTH_KEY",
        "X-JFS-Context-Key": "internal-key-a"
      },
      { waybills: ["WB001"] }
    );

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "UNAUTHORIZED_CALLER");
    assert.equal(scraperCalled, false);
  } finally {
    server.close();
  }
});

test("TEST 4: Missing X-JFS-Context-Key fails closed with 400 MISSING_INTEGRATION_CONTEXT", async () => {
  let scraperCalled = false;
  const { app } = setupTestEnvironment({
    scrapeWaybillStatusFn: async () => {
      scraperCalled = true;
      return { data: [] };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      {
        "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY"
      },
      { waybills: ["WB001"] }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "MISSING_INTEGRATION_CONTEXT");
    assert.equal(scraperCalled, false);
  } finally {
    server.close();
  }
});

test("TEST 5: Unknown X-JFS-Context-Key fails closed with 404 UNKNOWN_INTEGRATION_CONTEXT", async () => {
  let scraperCalled = false;
  const { app } = setupTestEnvironment({
    scrapeWaybillStatusFn: async () => {
      scraperCalled = true;
      return { data: [] };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      {
        "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY",
        "X-JFS-Context-Key": "non-existent-key"
      },
      { waybills: ["WB001"] }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "UNKNOWN_INTEGRATION_CONTEXT");
    assert.equal(scraperCalled, false);
  } finally {
    server.close();
  }
});

test("TEST 6 & 7: Query parameter and body context override attempts are strictly ignored", async () => {
  let capturedOptions;
  const { app } = setupTestEnvironment({
    scrapeWaybillStatusFn: async (options) => {
      capturedOptions = options;
      return { data: [{ billCode: "WB001" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status?outlet=SUM002A&contextKey=internal-key-b",
      {
        "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY",
        "X-JFS-Context-Key": "internal-key-a"
      },
      {
        waybills: ["WB001"],
        outletCode: "SUM002A",
        tenantId: "tenant-override-attempt"
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.metadata.outletCode, "SUM001A");
    assert.equal(capturedOptions.scanSiteCode, "SUM001A");
    assert.equal(capturedOptions.authToken, "TOKEN_A");
  } finally {
    server.close();
  }
});

test("TEST 8: Concurrent requests A and B remain strictly isolated", async () => {
  const requestsA = [];
  const requestsB = [];

  const { app } = setupTestEnvironment({
    scrapeWaybillStatusFn: async (options) => {
      await new Promise(r => setTimeout(r, 10));
      if (options.authToken === "TOKEN_A") requestsA.push(options);
      if (options.authToken === "TOKEN_B") requestsB.push(options);
      return { data: [{ billCode: "WBC" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const [resA, resB] = await Promise.all([
      makeRequest(
        server,
        "/internal/v1/waybill-status",
        { "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY", "X-JFS-Context-Key": "internal-key-a" },
        { waybills: ["WBA"] }
      ),
      makeRequest(
        server,
        "/internal/v1/waybill-status",
        { "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY", "X-JFS-Context-Key": "internal-key-b" },
        { waybills: ["WBB"] }
      )
    ]);

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.equal(resA.body.metadata.outletCode, "SUM001A");
    assert.equal(resB.body.metadata.outletCode, "SUM002A");
    assert.equal(requestsA[0].scanSiteCode, "SUM001A");
    assert.equal(requestsB[0].scanSiteCode, "SUM002A");
  } finally {
    server.close();
  }
});

test("TEST 9: 401 upstream error on A refreshes only authManager A", async () => {
  let loginCountA = 0;
  let loginCountB = 0;

  const authManagerA = createJfsAuthManager({
    initialToken: "EXPIRED_TOKEN_A",
    requestFn: async () => {
      loginCountA++;
      return { data: { data: { token: "REFRESHED_TOKEN_A", networkCode: "SUM001A" } } };
    }
  });
  await authManagerA.loginWithCredentials("USER_A", "PASS_A");
  authManagerA.setToken("EXPIRED_TOKEN_A");

  const authManagerB = createJfsAuthManager({
    initialToken: "VALID_TOKEN_B",
    requestFn: async () => {
      loginCountB++;
      return { data: { data: { token: "REFRESHED_TOKEN_B", networkCode: "SUM002A" } } };
    }
  });
  await authManagerB.loginWithCredentials("USER_B", "PASS_B");
  authManagerB.setToken("VALID_TOKEN_B");

  loginCountA = 0;
  loginCountB = 0;

  const { app } = setupTestEnvironment({
    authManagerA,
    authManagerB,
    scrapeWaybillStatusFn: async (options) => {
      if (options.authToken === "EXPIRED_TOKEN_A") {
        const err = new Error("Upstream authorization failed");
        err.code = "UNAUTHORIZED";
        err.status = 401;
        throw err;
      }
      return { data: [{ billCode: "WB_A" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      { "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY", "X-JFS-Context-Key": "internal-key-a" },
      { waybills: ["WB_A"] }
    );

    assert.equal(res.status, 200);
    assert.equal(loginCountA, 1);
    assert.equal(loginCountB, 0);
    assert.equal(authManagerA.getToken(), "REFRESHED_TOKEN_A");
    assert.equal(authManagerB.getToken(), "VALID_TOKEN_B");
  } finally {
    server.close();
  }
});

test("TEST 10: Network code mismatch fails closed with JFS_NETWORK_MISMATCH", async () => {
  const authManagerA = createJfsAuthManager({
    initialToken: "TOKEN_MISMATCH",
    requestFn: async () => ({ data: { data: { token: "TOKEN_MISMATCH", networkCode: "WRONG_NET_CODE" } } })
  });
  await authManagerA.loginWithCredentials("USER_A", "PASS_A");

  const { app } = setupTestEnvironment({ authManagerA });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      { "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY", "X-JFS-Context-Key": "internal-key-a" },
      { waybills: ["WB001"] }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "JFS_NETWORK_MISMATCH");
  } finally {
    server.close();
  }
});

test("TEST 11: Response and error payloads do NOT expose contextKey, authToken, or secret headers", async () => {
  const { app } = setupTestEnvironment();

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, "127.0.0.1", r));

  try {
    const res = await makeRequest(
      server,
      "/internal/v1/waybill-status",
      { "X-Auth-Key": "SECRET_INTERNAL_AUTH_KEY", "X-JFS-Context-Key": "internal-key-a" },
      { waybills: ["WB001"] }
    );

    const stringified = JSON.stringify(res.body);
    assert.equal(stringified.includes("internal-key-a"), false);
    assert.equal(stringified.includes("SECRET_INTERNAL_AUTH_KEY"), false);
    assert.equal(stringified.includes("TOKEN_A"), false);
  } finally {
    server.close();
  }
});
