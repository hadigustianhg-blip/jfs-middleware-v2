"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { executeMultiOutletScraper } = require("../src/services/jfs-multi-outlet-scrapers.service");

function context() {
  const state = { token: "SCOPED_TOKEN", refreshes: 0, clears: 0 };
  return {
    state,
    config: { networkCode: "DEV001", financeCode: "BDO000", financeId: 183 },
    axiosClient: { async post() { return { status: 200, data: { code: 0, data: [] }, headers: {} }; } },
    request: async () => { throw new Error("dedicated request must be injected in this test"); },
    authManager: {
      async getAuthToken() { return state.token; },
      clearToken() { state.clears += 1; },
      async refreshLogin() { state.refreshes += 1; state.token = "REFRESHED_TOKEN"; return state.token; }
    }
  };
}

function responseFor(options) {
  const url = options.url;
  if (url.includes("realtime_inv_man_dtl")) return { status: 200, data: { code: 0, data: { records: [] } } };
  if (url.includes("ibkFundRecord")) return { status: 200, data: { code: 0, data: { records: [] } } };
  if (url.includes("realtime_bus_aging_sign")) return { status: 200, data: { code: 0, data: { records: [] } } };
  if (url.includes("waybill_order_status")) return { status: 200, data: { code: 0, data: { records: [] } } };
  if (url.includes("detailSecret")) return { status: 200, data: { code: 0, data: {} } };
  if (url.includes("sensitiveDetailByWaybillNo")) return { status: 200, data: { code: 0, data: {} } };
  if (url.includes("omsOrderDispatch/page")) return { status: 200, data: { code: 0, data: { records: [], total: 0 } } };
  throw new Error(`unexpected URL ${url}`);
}

test("remaining active operations share scoped auth and never mutate global AUTH_TOKEN", async () => {
  const original = process.env.AUTH_TOKEN;
  process.env.AUTH_TOKEN = "GLOBAL_MUST_REMAIN_UNCHANGED";
  const ctx = context();
  const requestFn = async options => {
    assert.equal(options.headers.Authtoken, "SCOPED_TOKEN");
    return responseFor(options);
  };
  const dependencies = { requestFn };

  await executeMultiOutletScraper(ctx, "INVENTORY", { startDate: "2026-08-24", endDate: "2026-08-24", delayFn: async () => {} }, dependencies);
  await executeMultiOutletScraper(ctx, "IBK", { startDate: "2026-08-24", endDate: "2026-08-24" }, dependencies);
  await executeMultiOutletScraper(ctx, "AGING_SIGN", { date: "2026-08-24" }, dependencies);
  await executeMultiOutletScraper(ctx, "WAYBILL_STATUS", { waybillList: [], startDate: "2026-08-24", endDate: "2026-08-24" }, dependencies);
  await executeMultiOutletScraper(ctx, "SENDER_DETAIL", { waybillNo: "201680658475" }, dependencies);
  await executeMultiOutletScraper(ctx, "SENSITIVE_DETAIL", { waybillNo: "201680658475" }, dependencies);
  await executeMultiOutletScraper(ctx, "OMS", { startDate: "2026-08-24", endDate: "2026-08-24" }, dependencies);

  assert.equal(ctx.state.refreshes, 0);
  assert.equal(ctx.state.clears, 0);
  assert.equal(process.env.AUTH_TOKEN, "GLOBAL_MUST_REMAIN_UNCHANGED");
  if (original === undefined) delete process.env.AUTH_TOKEN;
  else process.env.AUTH_TOKEN = original;
});

test("a scoped application 401 refreshes only once and retries the current operation", async () => {
  const ctx = context();
  let calls = 0;
  const requestFn = async options => {
    calls += 1;
    if (calls === 1) return { status: 200, data: { code: 401 }, headers: {} };
    assert.equal(options.headers.Authtoken, "REFRESHED_TOKEN");
    return responseFor(options);
  };
  await executeMultiOutletScraper(ctx, "INVENTORY", {
    startDate: "2026-08-24", endDate: "2026-08-24", delayFn: async () => {}
  }, { requestFn });
  assert.equal(calls, 2);
  assert.equal(ctx.state.clears, 1);
  assert.equal(ctx.state.refreshes, 1);
});
