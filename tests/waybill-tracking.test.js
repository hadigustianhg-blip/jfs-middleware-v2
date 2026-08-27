"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WAYBILL_TRACKING_URL,
  buildWaybillTrackingPayload,
  normalizeWaybillTrackingResponse,
  redactPhoneNumbers,
  scrapeWaybillTracking
} = require("../src/scrapers/waybill-tracking.scraper");
const {
  executeMultiOutletScraper
} = require("../src/services/jfs-multi-outlet-scrapers.service");
const {
  OPERATION_FIELDS,
  createInternalMultiOutletRouter,
  validateOperationOptions
} = require("../src/routes/internal-multi-outlet.routes");

const WAYBILL_NO = "570570803375";

function successResponse(details) {
  return {
    code: 1,
    succ: true,
    fail: false,
    data: [{ keyword: WAYBILL_NO, details }]
  };
}

function trackingEvent(overrides = {}) {
  return {
    scanTime: "2026-08-26 08:00:00",
    uploadTime: "2026-08-26 08:01:00",
    scanTypeName: "Paket diterima",
    scanNetworkName: "Outlet Test",
    scanNetworkCode: "DEV001",
    nextStopName: "Gateway Test",
    nextNetworkCode: "GW001",
    status: "IN_TRANSIT",
    code: 94,
    scanMode: "APP",
    taskCode: "TASK-1",
    waybillTrackingContent: "YUDI MULYADI(82146562832)",
    staffContact: "082146562832",
    ...overrides
  };
}

function scopedContext(token = "SCOPED_TOKEN") {
  const state = { token, clears: 0, refreshes: 0 };
  return {
    state,
    outletCode: "OUTLET-DEV",
    config: { networkCode: "DEV001" },
    request: async () => { throw new Error("request must be injected"); },
    authManager: {
      async getAuthToken() { return state.token; },
      clearToken() { state.clears += 1; },
      async refreshLogin() {
        state.refreshes += 1;
        state.token = "REFRESHED_SCOPED_TOKEN";
        return state.token;
      }
    }
  };
}

test("tracking maps one waybill to the exact JFS endpoint and server-controlled payload", async () => {
  let received;
  const result = await scrapeWaybillTracking({
    waybillNo: ` ${WAYBILL_NO} `,
    authToken: "OUTLET_TOKEN",
    requestFn: async options => {
      received = options;
      return { status: 200, data: successResponse([trackingEvent()]) };
    }
  });

  assert.equal(received.method, "POST");
  assert.equal(received.url, WAYBILL_TRACKING_URL);
  assert.equal(received.url, "https://jfsgw.jtcargo.co.id/operatingplatform/podTracking/inner/query/keywordList");
  assert.deepEqual(received.body, {
    keywordList: [WAYBILL_NO],
    trackingTypeEnum: "WAYBILL",
    countryId: "1"
  });
  assert.equal(received.headers.Authtoken, "OUTLET_TOKEN");
  assert.equal(received.headers.Routename, "trackingExpress");
  assert.equal(received.headers.Lang, "ID");
  assert.equal(received.headers.Langtype, "ID");
  assert.equal(received.headers.Origin, "https://jfs.jtcargo.co.id");
  assert.equal(received.headers.Referer, "https://jfs.jtcargo.co.id/");
  assert.equal(received.headers.Cookie, undefined);
  assert.deepEqual(buildWaybillTrackingPayload(WAYBILL_NO), received.body);
  assert.equal(result.waybillNo, WAYBILL_NO);
});

test("tracking normalizes a deterministic timeline, derives latest, and excludes PII", () => {
  const response = successResponse([
    trackingEvent({
      scanTime: "2026-08-26 10:00:00",
      taskCode: "LATEST",
      waybillTrackingContent: "Diserahkan kepada BUDI +62 812-3456-7890"
    }),
    trackingEvent({
      scanTime: "2026-08-26 07:00:00",
      taskCode: "FIRST",
      waybillTrackingContent: "YUDI MULYADI(82146562832)"
    }),
    trackingEvent({
      scanTime: "2026-08-26 08:00:00",
      taskCode: "MIDDLE",
      waybillTrackingContent: "Transit tanpa nomor"
    })
  ]);

  const result = normalizeWaybillTrackingResponse(response, WAYBILL_NO);
  assert.deepEqual(result.timeline.map(item => item.taskCode), ["FIRST", "MIDDLE", "LATEST"]);
  assert.equal(result.latest.taskCode, "LATEST");
  assert.equal(result.timeline[0].description, "YUDI MULYADI");
  assert.equal(result.timeline[2].description, "Diserahkan kepada BUDI");
  assert.ok(result.timeline.every(item => !("staffContact" in item)));
  assert.doesNotMatch(JSON.stringify(result), /82146562832|812-3456-7890|staffContact/);
});

test("phone redaction removes parenthesized and standalone phone numbers", () => {
  assert.equal(redactPhoneNumbers("Nama(0812 3456 7890)"), "Nama");
  assert.equal(redactPhoneNumbers("Nama +62-812-3456-7890 selesai"), "Nama selesai");
});

test("tracking fails closed for app-level failure and missing data", () => {
  assert.throws(
    () => normalizeWaybillTrackingResponse({ code: 0, succ: false, fail: true, data: [] }, WAYBILL_NO),
    error => error.code === "JFS_WAYBILL_TRACKING_UPSTREAM_FAILED"
  );
  assert.throws(
    () => normalizeWaybillTrackingResponse({ code: 1, succ: true, fail: false, data: [] }, WAYBILL_NO),
    error => error.code === "WAYBILL_TRACKING_NOT_FOUND"
  );
});

test("tracking validates one waybill and rejects caller-controlled scope", () => {
  assert.deepEqual(OPERATION_FIELDS.WAYBILL_TRACKING, ["waybillNo"]);
  assert.doesNotThrow(() => validateOperationOptions("WAYBILL_TRACKING", { waybillNo: WAYBILL_NO }));
  for (const invalid of [{}, { waybillNo: "" }, { waybillNo: [WAYBILL_NO] }, { waybillNo: "ABC/123" }]) {
    assert.throws(
      () => validateOperationOptions("WAYBILL_TRACKING", invalid),
      error => error.code === "INVALID_WAYBILL_NO"
    );
  }
  for (const field of ["tenantId", "outletId", "networkCode", "authToken", "endpoint", "countryId"] ) {
    assert.throws(
      () => validateOperationOptions("WAYBILL_TRACKING", { waybillNo: WAYBILL_NO, [field]: "FORBIDDEN" }),
      error => error.code === "FORBIDDEN_RUNTIME_OPTION" && error.field === field
    );
  }
});

test("tracking route is protected by trusted scoped middleware", async () => {
  const router = createInternalMultiOutletRouter({ getAuthKey: () => "EXPECTED_KEY" });
  const layer = router.stack.find(item => item.route?.path === "/waybill-tracking");
  assert.ok(layer);
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack.length, 2);

  const result = {};
  await layer.route.stack[0].handle({
    headers: {},
    get() { return undefined; }
  }, {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  }, () => { result.next = true; });
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "UNAUTHORIZED");
  assert.equal(result.next, undefined);
});

test("tracking uses only its supplied outlet context and refreshes app 401 once", async () => {
  const firstContext = scopedContext("TENANT_A_TOKEN");
  const secondContext = scopedContext("TENANT_B_TOKEN");
  const seenTokens = [];
  const firstRequest = async options => {
    seenTokens.push(options.headers.Authtoken);
    if (seenTokens.length === 1) return { status: 200, data: { code: 401 }, headers: {} };
    return { status: 200, data: successResponse([trackingEvent()]), headers: {} };
  };
  const secondRequest = async options => {
    seenTokens.push(options.headers.Authtoken);
    return { status: 200, data: successResponse([trackingEvent()]), headers: {} };
  };

  await executeMultiOutletScraper(firstContext, "WAYBILL_TRACKING", { waybillNo: WAYBILL_NO }, { requestFn: firstRequest });
  await executeMultiOutletScraper(secondContext, "WAYBILL_TRACKING", { waybillNo: WAYBILL_NO }, { requestFn: secondRequest });

  assert.deepEqual(seenTokens, ["TENANT_A_TOKEN", "REFRESHED_SCOPED_TOKEN", "TENANT_B_TOKEN"]);
  assert.equal(firstContext.state.clears, 1);
  assert.equal(firstContext.state.refreshes, 1);
  assert.equal(secondContext.state.clears, 0);
  assert.equal(secondContext.state.refreshes, 0);
});

test("tracking implementation has no global token, mock, database, hardcoded outlet, or raw logging path", () => {
  const files = [
    "src/scrapers/waybill-tracking.scraper.js",
    "src/services/jfs-multi-outlet-scrapers.service.js",
    "src/routes/internal-multi-outlet.routes.js"
  ];
  const source = files.map(file => fs.readFileSync(path.join(__dirname, "..", file), "utf8")).join("\n");
  const scraperSource = fs.readFileSync(
    path.join(__dirname, "..", "src/scrapers/waybill-tracking.scraper.js"),
    "utf8"
  );
  assert.doesNotMatch(scraperSource, /SUM001A|AUTH_TOKEN|mockData|fallbackToMock|console\.|logger\.|prisma|database/i);
  assert.doesNotMatch(source, /WAYBILL_TRACKING[\s\S]{0,120}?(?:create|update|upsert|delete)\s*\(/i);
});
