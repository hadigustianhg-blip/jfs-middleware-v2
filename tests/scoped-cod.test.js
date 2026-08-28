"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  executeMultiOutletScraper
} = require("../src/services/jfs-multi-outlet-scrapers.service");

function codContext({ post, authManager } = {}) {
  return {
    tenantId: "tenant-a",
    outletId: "outlet-a",
    outletCode: "DEV001",
    config: {
      networkCode: "SUM001A",
      financeCode: "BDO000"
    },
    axiosClient: { post },
    authManager: authManager || {
      async getAuthToken() { return "SCOPED_TOKEN"; },
      clearToken() {},
      async refreshLogin() { return "REFRESHED_SCOPED_TOKEN"; }
    }
  };
}

test("scoped COD uses outlet context, scoped client, and preserves request and repayment contracts", async () => {
  const originalGlobalToken = process.env.AUTH_TOKEN;
  process.env.AUTH_TOKEN = "GLOBAL_TOKEN_MUST_NOT_BE_USED";
  let request;
  const context = codContext({
    async post(url, payload, config) {
      request = { url, payload, headers: config.headers };
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          data: {
            records: [
              {
                waybillNo: "WB-1",
                codAmount: 125000,
                repaymentStatus: 1,
                repaymentType: 2,
                repaymentTypeName: "QRIS COD",
                signTime: "2026-08-24 10:00:00",
                dispatchStaffName: "STAFF A"
              }
            ]
          }
        }
      };
    }
  });

  const result = await executeMultiOutletScraper(context, "COD", { date: "2026-08-24" });

  assert.match(request.url, /codAccounting\/api\/collection-receipt-detail\/page$/);
  assert.equal(request.payload.revenueNetworkCode, "SUM001A");
  assert.equal(request.payload.financeCenterId, "BDO000");
  assert.equal(request.payload.startTime, "2026-08-24 00:00:00");
  assert.equal(request.payload.endTime, "2026-08-24 23:59:59");
  assert.equal(request.headers.Authtoken, "SCOPED_TOKEN");
  assert.notEqual(request.headers.Authtoken, process.env.AUTH_TOKEN);
  assert.deepEqual(result.data, [{
    waybillNo: "WB-1",
    codAmount: 125000,
    repaymentStatus: 1,
    repaymentType: 2,
    repaymentTypeCode: 2,
    repaymentTypeLabel: "QRIS COD",
    signTime: "2026-08-24 10:00:00",
    dispatchStaffName: "STAFF A"
  }]);

  if (originalGlobalToken === undefined) delete process.env.AUTH_TOKEN;
  else process.env.AUTH_TOKEN = originalGlobalToken;
});

test("scoped COD refreshes application 401 once and retries with only the refreshed scoped token", async () => {
  let calls = 0;
  let clears = 0;
  let refreshes = 0;
  const tokens = [];
  const context = codContext({
    authManager: {
      async getAuthToken() { return "STALE_SCOPED_TOKEN"; },
      clearToken() { clears += 1; },
      async refreshLogin() { refreshes += 1; return "FRESH_SCOPED_TOKEN"; }
    },
    async post(_url, _payload, config) {
      calls += 1;
      tokens.push(config.headers.Authtoken);
      if (calls === 1) return { status: 200, headers: {}, data: { code: 401 } };
      return { status: 200, headers: {}, data: { code: 0, data: { records: [] } } };
    }
  });

  const result = await executeMultiOutletScraper(context, "COD", { date: "2026-08-24" });

  assert.equal(result.success, true);
  assert.deepEqual(tokens, ["STALE_SCOPED_TOKEN", "FRESH_SCOPED_TOKEN"]);
  assert.equal(calls, 2);
  assert.equal(clears, 1);
  assert.equal(refreshes, 1);
});

test("scoped COD fails closed after one retry when application 401 persists", async () => {
  let calls = 0;
  let refreshes = 0;
  const context = codContext({
    authManager: {
      async getAuthToken() { return "STALE_SCOPED_TOKEN"; },
      clearToken() {},
      async refreshLogin() { refreshes += 1; return "FRESH_SCOPED_TOKEN"; }
    },
    async post() {
      calls += 1;
      return { status: 200, headers: {}, data: { code: "401" } };
    }
  });

  await assert.rejects(
    executeMultiOutletScraper(context, "COD", { date: "2026-08-24" }),
    error => error.code === "UNAUTHORIZED" && error.applicationCode === 401
  );
  assert.equal(calls, 2);
  assert.equal(refreshes, 1);
});
