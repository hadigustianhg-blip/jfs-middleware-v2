"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PAGE_SIZE,
  WAYBILL_STATUS_URL,
  buildWaybillStatusHeaders,
  buildWaybillStatusPayload,
  mapWaybillStatusRecord,
  scrapeWaybillStatus
} = require("../src/scrapers/waybill-status.scraper");
const {
  JFS_BATCH_SIZE,
  createWaybillStatusService,
  normalizeWaybills
} = require("../src/services/waybill-status.service");
const {
  createWaybillStatusController
} = require("../src/controllers/waybill-status.controller");
const { getTodayJakarta } = require("../src/utils/date");

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("waybill status uses the correct URL, headers, and typed payload", async () => {
  let received;
  await scrapeWaybillStatus({
    waybills: ["TEST001", "TEST002"],
    startDate: "2026-07-27",
    endDate: "2026-07-28",
    authToken: "TEST_TOKEN",
    requestFn: async options => {
      received = options;
      return { data: { data: { records: [] } } };
    }
  });

  assert.equal(received.method, "POST");
  assert.equal(
    received.url,
    "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination?sqlCode=waybill_order_status_query"
  );
  assert.equal(received.url, WAYBILL_STATUS_URL);
  assert.deepEqual(received.headers, {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: "TEST_TOKEN",
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "waybillStatusConstantlyNew|businessIndicatorIndex",
    "User-Agent": "Mozilla/5.0"
  });
  assert.deepEqual(received.body, {
    current: 1,
    size: 100,
    startDate: "2026-07-27 00:00:00",
    endDate: "2026-07-28 23:59:59",
    scanSiteCode: "SUM001A",
    scanType: "收件",
    billType: 0,
    billNoList: ["TEST001", "TEST002"],
    signType: "3",
    convertResultFromDictionCode:
      "isVoid|106,scanType|266,currentScantType|266",
    countryId: "1"
  });
  assert.equal(typeof received.body.billType, "number");
  assert.equal(typeof received.body.signType, "string");
  assert.equal(received.headers.Cookie, undefined);
  assert.equal(received.headers["Sec-CH-UA"], undefined);
  assert.equal(
    buildWaybillStatusHeaders("TEST_TOKEN").Routename,
    "waybillStatusConstantlyNew|businessIndicatorIndex"
  );
  assert.deepEqual(
    buildWaybillStatusPayload({
      waybills: ["TEST003"],
      startDate: "2026-07-27",
      endDate: "2026-07-27",
      current: 1
    }).billNoList,
    ["TEST003"]
  );
});

test("waybill status maps the raw JFS response", () => {
  assert.deepEqual(mapWaybillStatusRecord({
    saleMan: "TEST SALES",
    currentScanSite: "SUM001A",
    scanUser: "TEST USER",
    estimateTime: "4-6",
    currentScantTime: "2026-07-27 09:13:31",
    scanTime: "2026-07-27 09:13:31",
    orderSourceName: "JFS",
    inputTime: "2026-07-27 09:13:30",
    billCode: "TEST001",
    scanSiteCode: "SUM001A",
    scanSite: "SUM001A",
    recordid: "TEST_RECORD_ID",
    stayReason: "*",
    isVoid: "tidak",
    receiverCityName: "Kota Test",
    currentScantType: "pengambilan paket",
    scanType: "pengambilan paket",
    estimateTimeStandard: "normal",
    problemReason: "*"
  }), {
    billCode: "TEST001",
    saleMan: "TEST SALES",
    currentScanSite: "SUM001A",
    scanUser: "TEST USER",
    estimateTime: "4-6",
    currentScanTime: "2026-07-27 09:13:31",
    scanTime: "2026-07-27 09:13:31",
    orderSourceName: "JFS",
    inputTime: "2026-07-27 09:13:30",
    scanSiteCode: "SUM001A",
    scanSite: "SUM001A",
    recordId: "TEST_RECORD_ID",
    stayReason: "*",
    isVoid: "tidak",
    receiverCityName: "Kota Test",
    currentScanType: "pengambilan paket",
    scanType: "pengambilan paket",
    estimateTimeStandard: "normal",
    problemReason: "*"
  });
});

test("waybill status paginates until a short page", async () => {
  const pages = [];
  const result = await scrapeWaybillStatus({
    waybills: ["TEST001"],
    startDate: "2026-07-27",
    endDate: "2026-07-27",
    authToken: "TEST_TOKEN",
    requestFn: async options => {
      pages.push(options.body.current);
      const count = options.body.current === 1 ? PAGE_SIZE : 1;
      return {
        data: {
          data: {
            records: Array.from({ length: count }, (_, index) => ({
              billCode: "TEST001",
              recordid: `${options.body.current}-${index}`
            }))
          }
        }
      };
    }
  });

  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.data.length, 101);
  assert.equal(result.pageCount, 2);
  assert.equal(result.stoppedReason, "has_more_false");
});

test("normalization removes empty and duplicate values and enforces 500", () => {
  assert.deepEqual(
    normalizeWaybills([" TEST001 ", "", null, "TEST001", 123, undefined]),
    ["TEST001", "123"]
  );
  assert.throws(() => normalizeWaybills("TEST001"), /harus berupa array/);
  assert.equal(
    normalizeWaybills(Array.from({ length: 500 }, (_, index) => index)).length,
    500
  );
  assert.throws(
    () => normalizeWaybills(Array.from({ length: 501 }, (_, index) => index)),
    error => error.code === "WAYBILL_LIMIT_EXCEEDED"
  );
});

test("service splits JFS billNoList into batches of at most 100", async () => {
  const batches = [];
  const service = createWaybillStatusService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeWaybillStatusFn: async options => {
      batches.push(options);
      return {
        data: options.waybills.map(billCode =>
          mapWaybillStatusRecord({ billCode })
        )
      };
    }
  });
  const waybills = Array.from({ length: 205 }, (_, index) => `TEST${index}`);
  const result = await service.getWaybillStatusBatch({
    waybills,
    startDate: "2026-07-27",
    endDate: "2026-07-27"
  });

  assert.deepEqual(batches.map(batch => batch.waybills.length), [
    JFS_BATCH_SIZE, JFS_BATCH_SIZE, 5
  ]);
  assert.ok(batches.every(batch => batch.authToken === "TEST_TOKEN"));
  assert.equal(result.totalRequested, 205);
  assert.equal(result.totalFound, 205);
  assert.equal(result.totalNotFound, 0);
});

test("service returns not_found and keeps multiple records per waybill", async () => {
  const service = createWaybillStatusService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeWaybillStatusFn: async () => ({
      data: [
        mapWaybillStatusRecord({ billCode: "FOUND", recordid: "1" }),
        mapWaybillStatusRecord({ billCode: "FOUND", recordid: "2" })
      ]
    })
  });
  const result = await service.getWaybillStatusBatch({
    waybills: ["FOUND", "MISSING", "FOUND", ""],
    startDate: "2026-07-27",
    endDate: "2026-07-27"
  });

  assert.equal(result.totalRequested, 2);
  assert.equal(result.totalFound, 1);
  assert.equal(result.totalNotFound, 1);
  assert.equal(
    result.data.filter(item => item.sourceWaybill === "FOUND").length,
    2
  );
  assert.deepEqual(result.data.find(item => item.status === "not_found"), {
    sourceWaybill: "MISSING",
    status: "not_found"
  });
  assert.deepEqual(result.errors, []);
});

test("a failed JFS batch does not fail another batch", async () => {
  let call = 0;
  const service = createWaybillStatusService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeWaybillStatusFn: async ({ waybills }) => {
      call += 1;
      if (call === 1) {
        throw new Error("Safe mock failure");
      }
      return {
        data: waybills.map(billCode =>
          mapWaybillStatusRecord({ billCode })
        )
      };
    }
  });
  const waybills = Array.from({ length: 101 }, (_, index) => `TEST${index}`);
  const result = await service.getWaybillStatusBatch({
    waybills,
    startDate: "2026-07-27",
    endDate: "2026-07-27"
  });

  assert.equal(result.success, true);
  assert.equal(result.totalRequested, 101);
  assert.equal(result.totalFound, 1);
  assert.equal(result.totalNotFound, 0);
  assert.equal(result.errors.length, 100);
  assert.equal(result.data.length, 1);
});

test("controller applies Jakarta date defaults and validates dates", async () => {
  let received;
  const controller = createWaybillStatusController({
    waybillStatusService: {
      async getWaybillStatusBatch(options) {
        received = options;
        return {
          success: true,
          totalRequested: 0,
          totalFound: 0,
          totalNotFound: 0,
          data: [],
          errors: []
        };
      }
    }
  });
  const response = createMockResponse();
  await controller.getWaybillStatusBatch({
    body: { waybills: [] }
  }, response);
  assert.deepEqual(received, {
    waybills: [],
    startDate: getTodayJakarta(),
    endDate: getTodayJakarta()
  });

  const invalidResponse = createMockResponse();
  await controller.getWaybillStatusBatch({
    body: {
      waybills: [],
      startDate: "2026-07-28",
      endDate: "2026-07-27"
    }
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.body.success, false);
});

test("service obtains token from getAuthToken", async () => {
  let receivedToken;
  const service = createWaybillStatusService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeWaybillStatusFn: async ({ authToken }) => {
      receivedToken = authToken;
      return { data: [] };
    }
  });
  await service.getWaybillStatusBatch({
    waybills: ["TEST001"],
    startDate: "2026-07-27",
    endDate: "2026-07-27"
  });
  assert.equal(receivedToken, "TEST_TOKEN");

  const missingTokenService = createWaybillStatusService({
    getAuthToken: () => ""
  });
  await assert.rejects(
    missingTokenService.getWaybillStatusBatch({
      waybills: ["TEST001"],
      startDate: "2026-07-27",
      endDate: "2026-07-27"
    }),
    error => error.code === "TOKEN_EMPTY"
  );
});
