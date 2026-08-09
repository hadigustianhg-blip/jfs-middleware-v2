"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createJfsAuthManager } = require("../src/auth/jfs-auth-manager");
const { createJfsOutletContext, createJfsHttpClient } = require("../src/context");
const { createContextWaybillStatusService } = require("../src/services/waybill-status.service");

test("TEST A: Context A pilot request sends scanSiteCode = SUM001A and token = TOKEN_A", async () => {
  let receivedPayload;
  let receivedHeaders;

  const mockScraper = async ({ waybills, startDate, endDate, authToken, scanSiteCode, requestFn }) => {
    // Call requestFn to test real HTTP client parameter passing
    const response = await requestFn({
      method: "POST",
      url: "http://127.0.0.1:0/mock",
      body: { waybills, startDate, endDate, scanSiteCode },
      headers: { Authtoken: authToken }
    });
    return { data: [{ billCode: "WB001" }], pageCount: 1, stoppedReason: "COMPLETED" };
  };

  const authManagerA = createJfsAuthManager({ initialToken: "TOKEN_A" });
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

  const pilotServiceA = createContextWaybillStatusService(contextA, {
    scrapeWaybillStatusFn: async (options) => {
      receivedPayload = options;
      return { data: [{ billCode: "WB001" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const result = await pilotServiceA.getWaybillStatusBatch({
    waybills: ["WB001"],
    startDate: "2026-08-01",
    endDate: "2026-08-01"
  });

  assert.equal(result.success, true);
  assert.equal(receivedPayload.scanSiteCode, "SUM001A");
  assert.equal(receivedPayload.authToken, "TOKEN_A");
});

test("TEST B: Context B pilot request sends scanSiteCode = SUM002A and token = TOKEN_B", async () => {
  let receivedPayload;

  const authManagerB = createJfsAuthManager({ initialToken: "TOKEN_B" });
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

  const pilotServiceB = createContextWaybillStatusService(contextB, {
    scrapeWaybillStatusFn: async (options) => {
      receivedPayload = options;
      return { data: [{ billCode: "WB002" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const result = await pilotServiceB.getWaybillStatusBatch({
    waybills: ["WB002"],
    startDate: "2026-08-01",
    endDate: "2026-08-01"
  });

  assert.equal(result.success, true);
  assert.equal(receivedPayload.scanSiteCode, "SUM002A");
  assert.equal(receivedPayload.authToken, "TOKEN_B");
});

test("TEST C: Concurrent Promise.all operations for A and B ensure no token/config cross-bleeding", async () => {
  const requestsA = [];
  const requestsB = [];

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    initialToken: "TOKEN_CONCURRENT_A",
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
    initialToken: "TOKEN_CONCURRENT_B",
    config: {
      networkCode: "SUM002A",
      financeCode: "JKT999",
      financeId: 555,
      scanSiteCode: "SUM002A"
    }
  });

  const pilotServiceA = createContextWaybillStatusService(contextA, {
    scrapeWaybillStatusFn: async (options) => {
      await new Promise(r => setTimeout(r, 20));
      requestsA.push(options);
      return { data: [{ billCode: "WBA" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const pilotServiceB = createContextWaybillStatusService(contextB, {
    scrapeWaybillStatusFn: async (options) => {
      await new Promise(r => setTimeout(r, 10));
      requestsB.push(options);
      return { data: [{ billCode: "WBB" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const [resA, resB] = await Promise.all([
    pilotServiceA.getWaybillStatusBatch({ waybills: ["WBA"], startDate: "2026-08-01", endDate: "2026-08-01" }),
    pilotServiceB.getWaybillStatusBatch({ waybills: ["WBB"], startDate: "2026-08-01", endDate: "2026-08-01" })
  ]);

  assert.equal(resA.success, true);
  assert.equal(resB.success, true);

  assert.equal(requestsA[0].scanSiteCode, "SUM001A");
  assert.equal(requestsA[0].authToken, "TOKEN_CONCURRENT_A");

  assert.equal(requestsB[0].scanSiteCode, "SUM002A");
  assert.equal(requestsB[0].authToken, "TOKEN_CONCURRENT_B");
});

test("TEST D: 401 on client A refreshes only authManager A, B remains unchanged", async () => {
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

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    config: { networkCode: "SUM001A", financeCode: "BDO000", financeId: 183, scanSiteCode: "SUM001A" },
    authManager: authManagerA
  });

  const contextB = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_B_ID",
    outletCode: "SUM002A",
    config: { networkCode: "SUM002A", financeCode: "JKT999", financeId: 555, scanSiteCode: "SUM002A" },
    authManager: authManagerB
  });

  const pilotServiceA = createContextWaybillStatusService(contextA, {
    scrapeWaybillStatusFn: async (options) => {
      if (options.authToken === "EXPIRED_TOKEN_A") {
        const error = new Error("Upstream authorization failed");
        error.code = "UNAUTHORIZED";
        error.status = 401;
        throw error;
      }
      return { data: [{ billCode: "WB_A" }], pageCount: 1, stoppedReason: "COMPLETED" };
    }
  });

  const resultA = await pilotServiceA.getWaybillStatusBatch({
    waybills: ["WB_A"],
    startDate: "2026-08-01",
    endDate: "2026-08-01"
  });

  assert.equal(resultA.success, true);
  assert.equal(loginCountA, 1);
  assert.equal(loginCountB, 0);
  assert.equal(contextA.getAuthToken(), "REFRESHED_TOKEN_A");
  assert.equal(contextB.getAuthToken(), "VALID_TOKEN_B");
});

test("TEST E: Context A config networkCode mismatch throws JFS_NETWORK_MISMATCH", async () => {
  const authManagerA = createJfsAuthManager({
    initialToken: "TOKEN_MISMATCH",
    requestFn: async () => ({ data: { data: { token: "TOKEN_MISMATCH", networkCode: "MISMATCHED_NET" } } })
  });

  await authManagerA.loginWithCredentials("USER_A", "PASS_A");

  const contextA = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    config: {
      networkCode: "SUM001A", // Expected is SUM001A, actual from login is MISMATCHED_NET
      financeCode: "BDO000",
      financeId: 183,
      scanSiteCode: "SUM001A"
    },
    authManager: authManagerA
  });

  const pilotServiceA = createContextWaybillStatusService(contextA);

  await assert.rejects(
    () => pilotServiceA.getWaybillStatusBatch({ waybills: ["WB001"], startDate: "2026-08-01", endDate: "2026-08-01" }),
    {
      name: "JfsNetworkMismatchError",
      code: "JFS_NETWORK_MISMATCH",
      status: 400
    }
  );
});

test("TEST G: Pilot path fails closed if context token or config is missing", async () => {
  const emptyTokenAuthManager = createJfsAuthManager({ initialToken: "" });
  const contextNoToken = createJfsOutletContext({
    tenantId: "TENANT_1",
    outletId: "OUTLET_A_ID",
    outletCode: "SUM001A",
    authManager: emptyTokenAuthManager
  });

  const pilotService = createContextWaybillStatusService(contextNoToken);

  await assert.rejects(
    () => pilotService.getWaybillStatusBatch({ waybills: ["WB001"], startDate: "2026-08-01", endDate: "2026-08-01" }),
    {
      code: "JFS_AUTH_NOT_CONFIGURED"
    }
  );
});
