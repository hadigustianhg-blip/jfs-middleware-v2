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

test("runtime route validation rejects caller-controlled mock and fallback fields for every scoped operation", () => {
  const { OPERATION_FIELDS, validateOperationOptions } = require("../src/routes/internal-multi-outlet.routes");
  for (const operation of Object.keys(OPERATION_FIELDS)) {
    assert.throws(
      () => validateOperationOptions(operation, { mockData: [{ fabricated: true }] }),
      error => error.code === "FORBIDDEN_RUNTIME_OPTION" && error.field === "mockData"
    );
    assert.throws(
      () => validateOperationOptions(operation, { fallbackToMock: true }),
      error => error.code === "FORBIDDEN_RUNTIME_OPTION" && error.field === "fallbackToMock"
    );
  }
});

test("runtime route returns 400 before executor can honor a forbidden test hook", async () => {
  const { createInternalMultiOutletRouter } = require("../src/routes/internal-multi-outlet.routes");
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "KEY" });
  const layer = router.stack.find(item => item.route?.path === "/pickup");
  const handler = layer.route.stack.at(-1).handle;
  const result = {};
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
    set() { return this; }
  };
  await handler({
    body: { mockData: [{ waybillNo: "FABRICATED" }] },
    outletContext: { getState() { return {}; } }
  }, res);
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error, "FORBIDDEN_RUNTIME_OPTION");
});

test("fallbackToMock cannot suppress an upstream failure", async () => {
  const ctx = context();
  let upstreamCalls = 0;
  ctx.axiosClient.post = async () => {
    upstreamCalls += 1;
    throw new Error("UPSTREAM_FAILED");
  };
  await assert.rejects(
    executeMultiOutletScraper(ctx, "PICKUP", { date: "2026-08-24", fallbackToMock: true }),
    error => error.code === "FORBIDDEN_RUNTIME_OPTION"
  );
  assert.equal(upstreamCalls, 0);
  await assert.rejects(
    executeMultiOutletScraper(ctx, "PICKUP", { date: "2026-08-24" }),
    /UPSTREAM_FAILED/
  );
  assert.equal(upstreamCalls, 1);
});
