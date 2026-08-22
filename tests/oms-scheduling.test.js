"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_STATUS_CODES,
  DETAIL_URL,
  LIST_URL,
  MAX_PAGES,
  scrapeOmsSchedulingDetail,
  scrapeOmsSchedulingList,
  validateExternalJfsId,
  validateListInput
} = require("../src/scrapers/oms-scheduling.scraper");
const {
  executeMultiOutletScraper
} = require("../src/services/jfs-multi-outlet-scrapers.service");
const {
  createInternalMultiOutletRouter
} = require("../src/routes/internal-multi-outlet.routes");

const listInput = {
  startInputTime: "2026-08-16 00:00:00",
  endInputTime: "2026-08-22 23:59:59"
};

function formText(form) {
  return form.getBuffer().toString("utf8");
}

function scopedContext(overrides = {}) {
  let tokenCalls = 0;
  return {
    tenantId: "tenant-a",
    outletId: "outlet-a",
    outletCode: "DEV001",
    config: { networkCode: "SUM001A" },
    authManager: {
      async getAuthToken() { tokenCalls += 1; return "SCOPED_TOKEN"; },
      clearToken() {},
      async refreshLogin() { return "REFRESHED_SCOPED_TOKEN"; }
    },
    tokenCalls: () => tokenCalls,
    ...overrides
  };
}

test("list validation is explicit, bounded, and excludes sendCode", () => {
  assert.deepEqual(validateListInput(listInput), {
    ...listInput,
    timeType: 1,
    orderStatusCode: DEFAULT_STATUS_CODES,
    startPickTime: "",
    endPickTime: "",
    pageSize: 100
  });
  assert.equal(Object.hasOwn(validateListInput({ ...listInput, sendCode: "01" }), "sendCode"), false);
  assert.equal(validateListInput({ ...listInput, orderStatusCode: [101, "102"] }).orderStatusCode, "101,102");
  assert.throws(() => validateListInput({ ...listInput, orderStatusCode: "101,x" }), /INVALID_ORDER_STATUS_CODE/);
  assert.throws(() => validateListInput({ ...listInput, pageSize: 101 }), /INVALID_PAGE_SIZE/);
  assert.throws(() => validateListInput({ endInputTime: listInput.endInputTime }), /START_INPUT_TIME_REQUIRED/);
});

test("list fetches all pages, preserves complete records, and injects no sendCode", async () => {
  const sourceRecords = [
    { id: "1", waybillId: "WB1", sendName: "drop-off", pickStaffCode: "S1", customField: "kept" },
    { id: "2", waybillId: "WB2", sendName: "Jemput Paket", pickStaffCode: "", pickFailReason: "Alamat tutup" },
    { id: "3", waybillId: "WB3", orderStatusCode: "102" }
  ];
  const requests = [];
  const result = await scrapeOmsSchedulingList({ ...listInput, pageSize: 1 }, "SCOPED_TOKEN", async options => {
    requests.push(options);
    const record = sourceRecords[requests.length - 1];
    return { data: { data: { total: 3, pages: 3, records: [record] } } };
  });
  assert.equal(requests.length, 3);
  assert.deepEqual(result, { records: sourceRecords, total: 3, pagesFetched: 3 });
  assert.ok(requests.every(request => request.url === LIST_URL));
  assert.ok(requests.every(request => !formText(request.body).includes('name="sendCode"')));
  assert.ok(requests.every(request => formText(request.body).includes(DEFAULT_STATUS_CODES)));
});

test("list stops on an empty page and reports pages fetched", async () => {
  let calls = 0;
  const result = await scrapeOmsSchedulingList({ ...listInput, pageSize: 2 }, "TOKEN", async () => {
    calls += 1;
    return { data: { data: { records: calls === 1 ? [{ id: "1" }, { id: "2" }] : [] } } };
  });
  assert.equal(calls, 2);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.records.length, 2);
});

test("list fails closed on repeated pages and maximum-page exhaustion", async () => {
  await assert.rejects(
    scrapeOmsSchedulingList({ ...listInput, pageSize: 1 }, "TOKEN", async () => ({
      data: { data: { records: [{ id: "same" }] } }
    })),
    error => error.code === "OMS_SCHEDULING_REPEATED_PAGE"
  );
  let page = 0;
  await assert.rejects(
    scrapeOmsSchedulingList({ ...listInput, pageSize: 1 }, "TOKEN", async () => ({
      data: { data: { records: [{ id: String(++page) }] } }
    })),
    error => error.code === "OMS_SCHEDULING_MAX_PAGES_EXCEEDED" && page === MAX_PAGES
  );
});

test("detail validates external id, calls exact endpoint, and preserves response", async () => {
  assert.throws(() => validateExternalJfsId(""), /EXTERNAL_JFS_ID_REQUIRED/);
  assert.throws(() => validateExternalJfsId("12-ab"), /INVALID_EXTERNAL_JFS_ID/);
  const detail = {
    id: "957133186817617956",
    waybillId: "WB1",
    senderMobilePhone: "0816700535",
    pickNetworkCode: "SUM001A"
  };
  let captured;
  const result = await scrapeOmsSchedulingDetail({ externalJfsId: detail.id }, "SCOPED_TOKEN", async options => {
    captured = options;
    return { data: { data: detail } };
  });
  assert.equal(captured.url, DETAIL_URL);
  assert.deepEqual(captured.params, { id: detail.id });
  assert.equal(captured.headers.Authtoken, "SCOPED_TOKEN");
  assert.deepEqual(result, detail);
});

test("new operations use only scoped auth and retry scoped auth once", async () => {
  const originalGlobalToken = process.env.AUTH_TOKEN;
  process.env.AUTH_TOKEN = "GLOBAL_TOKEN_MUST_NOT_BE_USED";
  let requestCalls = 0;
  let clears = 0;
  const context = scopedContext({
    authManager: {
      async getAuthToken() { return "SCOPED_TOKEN"; },
      clearToken() { clears += 1; },
      async refreshLogin() { return "REFRESHED_SCOPED_TOKEN"; }
    }
  });
  const result = await executeMultiOutletScraper(context, "OMS_SCHEDULING_DETAIL", {
    externalJfsId: "123"
  }, {
    requestFn: async options => {
      requestCalls += 1;
      if (requestCalls === 1) throw Object.assign(new Error("unauthorized"), { code: "UNAUTHORIZED", status: 401 });
      assert.equal(options.headers.Authtoken, "REFRESHED_SCOPED_TOKEN");
      return { data: { data: { id: "123", waybillId: "WB1" } } };
    }
  });
  assert.equal(clears, 1);
  assert.equal(requestCalls, 2);
  assert.equal(result.id, "123");
  if (originalGlobalToken === undefined) delete process.env.AUTH_TOKEN;
  else process.env.AUTH_TOKEN = originalGlobalToken;
});

test("scoped routes are protected and registered independently from legacy routes", () => {
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "KEY" });
  const paths = router.stack.filter(layer => layer.route).map(layer => layer.route.path);
  assert.ok(paths.includes("/oms-scheduling-list"));
  assert.ok(paths.includes("/oms-scheduling-detail"));
  assert.ok(paths.includes("/oms"));
  assert.ok(paths.includes("/sender-detail"));
  for (const path of ["/oms-scheduling-list", "/oms-scheduling-detail"]) {
    const layer = router.stack.find(item => item.route?.path === path);
    assert.equal(layer.route.stack.length, 2);
  }
});

test("detail route marks the sensitive response as no-store", () => {
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "KEY" });
  const layer = router.stack.find(item => item.route?.path === "/oms-scheduling-detail");
  const handler = layer.route.stack.at(-1).handle;
  assert.match(handler.toString(), /Cache-Control/);
  assert.match(handler.toString(), /private, no-store, max-age=0/);
});
