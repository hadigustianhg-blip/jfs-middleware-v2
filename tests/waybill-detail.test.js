"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WAYBILL_DETAIL_URL,
  normalizeWaybillDetailResponse,
  scrapeWaybillDetail
} = require("../src/scrapers/waybill-detail.scraper");
const { executeMultiOutletScraper } = require("../src/services/jfs-multi-outlet-scrapers.service");
const { OPERATION_FIELDS, createInternalMultiOutletRouter, validateOperationOptions } = require("../src/routes/internal-multi-outlet.routes");

const WAYBILL_NO = "570570803375";

function success(overrides = {}) {
  return { code: 1, succ: true, fail: false, data: {
    waybillNo: WAYBILL_NO, customerName: "Customer A", senderName: "Sender A",
    senderCityName: "Bandung", receiverName: "Receiver A",
    receiverMobilePhone: "(+6*********5612)", receiverDetailedAddress: "Alamat operasional",
    goodsName: "Dokumen", packageNumber: 1, codMoney: 12500,
    senderMobilePhone: "081234567890", receiverTelphone: "081200000000",
    longitude: "107.1", latitude: "-6.1", customerOrderId: "secret-id", orderId: "secret-order",
    ...overrides
  } };
}

function scopedContext(token = "SCOPED_TOKEN") {
  const state = { token, clears: 0, refreshes: 0 };
  return { state, outletCode: "OUTLET-DEV", config: { networkCode: "DEV001" },
    request: async () => { throw new Error("request must be injected"); },
    authManager: { async getAuthToken() { return state.token; }, clearToken() { state.clears += 1; },
      async refreshLogin() { state.refreshes += 1; state.token = "REFRESHED_TOKEN"; return state.token; } } };
}

test("detail uses the exact verified endpoint, payload, scoped token, and tracking headers", async () => {
  let received;
  const result = await scrapeWaybillDetail({ waybillNo: ` ${WAYBILL_NO} `, authToken: "OUTLET_TOKEN",
    requestFn: async options => { received = options; return { status: 200, data: success() }; } });
  assert.equal(received.url, WAYBILL_DETAIL_URL);
  assert.equal(received.url, "https://jfsgw.jtcargo.co.id/operatingplatform/order/getOrderDetail");
  assert.equal(received.method, "POST");
  assert.deepEqual(received.body, { waybillNo: WAYBILL_NO, countryId: "1" });
  assert.equal(received.headers.Authtoken, "OUTLET_TOKEN");
  assert.equal(received.headers.Routename, "trackingExpress");
  assert.equal(received.headers.Lang, "ID");
  assert.equal(received.headers.Langtype, "ID");
  assert.equal(received.headers.Cookie, undefined);
  assert.equal(result.waybillNo, WAYBILL_NO);
});

test("detail returns only the narrow normalized contract and preserves masked phone", () => {
  const result = normalizeWaybillDetailResponse(success(), WAYBILL_NO);
  assert.deepEqual(result, { waybillNo: WAYBILL_NO, customerName: "Customer A",
    sender: { name: "Sender A", city: "Bandung" },
    receiver: { name: "Receiver A", mobileMasked: "(+6*********5612)", address: "Alamat operasional" },
    goods: { name: "Dokumen", packageNumber: 1 }, codMoney: 12500 });
  const serialized = JSON.stringify(result);
  for (const forbidden of ["senderMobilePhone", "receiverTelphone", "longitude", "latitude", "customerOrderId", "orderId", "081234567890"]) assert.doesNotMatch(serialized, new RegExp(forbidden));
});

test("detail drops a clear receiver phone instead of exposing it", () => {
  const result = normalizeWaybillDetailResponse(success({ receiverMobilePhone: "081234567890" }), WAYBILL_NO);
  assert.equal(result.receiver.mobileMasked, "");
});

test("detail fails closed for not-found and app-level failure", () => {
  assert.throws(() => normalizeWaybillDetailResponse({ code: 1, succ: true, fail: false, data: null }, WAYBILL_NO), error => error.code === "WAYBILL_DETAIL_NOT_FOUND");
  assert.throws(() => normalizeWaybillDetailResponse({ code: 0, succ: false, fail: true, data: {} }, WAYBILL_NO), error => error.code === "JFS_WAYBILL_DETAIL_UPSTREAM_FAILED");
});

test("detail validates one identifier and rejects caller-controlled context", () => {
  assert.deepEqual(OPERATION_FIELDS.WAYBILL_DETAIL, ["waybillNo"]);
  assert.doesNotThrow(() => validateOperationOptions("WAYBILL_DETAIL", { waybillNo: WAYBILL_NO }));
  for (const value of [{}, { waybillNo: "" }, { waybillNo: [WAYBILL_NO] }, { waybillNo: "ABC/123" }]) assert.throws(() => validateOperationOptions("WAYBILL_DETAIL", value), error => error.code === "INVALID_WAYBILL_NO");
  for (const field of ["tenantId", "outletId", "networkCode", "countryId", "routeName", "authToken", "url"]) assert.throws(() => validateOperationOptions("WAYBILL_DETAIL", { waybillNo: WAYBILL_NO, [field]: "forbidden" }), error => error.code === "FORBIDDEN_RUNTIME_OPTION");
});

test("detail route is trusted, no-store, and maps not-found cleanly", async () => {
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "EXPECTED_KEY" });
  const layer = router.stack.find(item => item.route?.path === "/waybill-detail");
  assert.ok(layer);
  assert.equal(layer.route.stack.length, 2);
  const result = {};
  await layer.route.stack[0].handle({ headers: {}, get() { return undefined; } },
    { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } },
    () => { result.next = true; });
  assert.equal(result.status, 401);
  assert.equal(result.next, undefined);
});

test("detail uses scoped auth and refreshes an application 401 once", async () => {
  const context = scopedContext();
  const seen = [];
  await executeMultiOutletScraper(context, "WAYBILL_DETAIL", { waybillNo: WAYBILL_NO }, { requestFn: async options => {
    seen.push(options.headers.Authtoken);
    return seen.length === 1 ? { status: 200, data: { code: 401 }, headers: {} } : { status: 200, data: success(), headers: {} };
  } });
  assert.deepEqual(seen, ["SCOPED_TOKEN", "REFRESHED_TOKEN"]);
  assert.equal(context.state.refreshes, 1);
});

test("detail bypasses eager top-level getAuthToken call and calls getAuthToken only once via executeWithScopedAuth", async () => {
  const context = scopedContext("SCOPED_OK_TOKEN");
  let getTokenCalls = 0;
  context.authManager.getAuthToken = async () => {
    getTokenCalls += 1;
    return context.state.token;
  };

  const requestFn = async options => {
    assert.equal(options.headers.Authtoken, "SCOPED_OK_TOKEN");
    return { status: 200, data: success(), headers: {} };
  };

  const result = await executeMultiOutletScraper(
    context,
    "WAYBILL_DETAIL",
    { waybillNo: WAYBILL_NO },
    { requestFn }
  );

  assert.equal(result.waybillNo, WAYBILL_NO);
  assert.equal(getTokenCalls, 1);
});

test("detail implementation has no database, global token, hardcoded outlet, or logging path", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/scrapers/waybill-detail.scraper.js"), "utf8");
  assert.doesNotMatch(source, /SUM001A|AUTH_TOKEN|console\.|logger\.|prisma|database|cookie/i);
  assert.doesNotMatch(source, /senderMobilePhone|receiverTelphone|longitude|latitude|customerOrderId|orderId/);
});
