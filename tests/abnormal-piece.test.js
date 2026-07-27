"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ABNORMAL_PIECE_URL,
  buildAbnormalPieceHeaders,
  buildAbnormalPiecePayload,
  mapAbnormalPieceRecord,
  scrapeAbnormalPiece
} = require("../src/scrapers/abnormal-piece.scraper");
const {
  BATCH_DELAY_MS,
  createAbnormalPieceService,
  normalizeWaybills
} = require("../src/services/abnormal-piece.service");
const {
  createAbnormalPieceController
} = require("../src/controllers/abnormal-piece.controller");

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

test("abnormal piece request uses the input waybill and required headers", async () => {
  let received;
  await scrapeAbnormalPiece({
    waybillId: "TEST000001",
    authToken: "TEST_TOKEN",
    requestFn: async options => {
      received = options;
      return { data: { data: { records: [] } } };
    }
  });

  assert.equal(received.method, "POST");
  assert.equal(received.url, ABNORMAL_PIECE_URL);
  assert.deepEqual(received.body, {
    current: 1,
    size: 100,
    waybillId: "TEST000001",
    countryId: "1"
  });
  assert.deepEqual(received.headers, {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: "TEST_TOKEN",
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "trackingExpress",
    "User-Agent": "Mozilla/5.0"
  });
  assert.equal(received.headers.Cookie, undefined);
  assert.equal(received.headers["Sec-CH-UA"], undefined);
  assert.equal(buildAbnormalPieceHeaders("TEST_TOKEN").Routename, "trackingExpress");
  assert.equal(buildAbnormalPiecePayload("TEST000002").waybillId, "TEST000002");
});

test("abnormal piece maps the raw JFS response", () => {
  assert.deepEqual(mapAbnormalPieceRecord({
    waybillId: "TEST000001",
    abnormalPieceName: "Gateway salah kirim",
    operatorCode: "SUM001AUSER",
    operatorName: "TEST USER",
    scanBy: 399590,
    scanByCode: "SUM001AUSER",
    scanByName: "TEST USER",
    scanNetworkCode: "SUM001A",
    dataCollectionTime: "2026-07-27 10:49:58",
    scanTime: "2026-07-27 10:49:58",
    remark: "missroute",
    ignored: "not exposed"
  }), {
    waybillId: "TEST000001",
    abnormalPieceName: "Gateway salah kirim",
    operatorCode: "SUM001AUSER",
    operatorName: "TEST USER",
    scanBy: 399590,
    scanByCode: "SUM001AUSER",
    scanByName: "TEST USER",
    scanNetworkCode: "SUM001A",
    dataCollectionTime: "2026-07-27 10:49:58",
    scanTime: "2026-07-27 10:49:58",
    remark: "missroute"
  });
});

test("normalization removes empty and duplicate waybills and uses strings", () => {
  assert.deepEqual(
    normalizeWaybills([" TEST001 ", "", null, "TEST001", 123, undefined]),
    ["TEST001", "123"]
  );
  assert.throws(() => normalizeWaybills("TEST001"), /harus berupa array/);
});

test("abnormal piece batch gets its token and isolates individual failures", async () => {
  const calls = [];
  const delays = [];
  const service = createAbnormalPieceService({
    getAuthToken: () => "TEST_TOKEN",
    delayFn: async milliseconds => delays.push(milliseconds),
    scrapeAbnormalPieceFn: async ({ waybillId, authToken }) => {
      calls.push({ waybillId, authToken });
      if (waybillId === "FAIL") {
        throw new Error("Safe mock failure");
      }
      if (waybillId === "EMPTY") {
        return { data: [] };
      }
      return {
        data: [
          mapAbnormalPieceRecord({ waybillId, remark: "first" }),
          mapAbnormalPieceRecord({ waybillId, remark: "second" })
        ]
      };
    }
  });

  const result = await service.getAbnormalPieceBatch({
    waybills: ["OK", "EMPTY", "FAIL", "OK", "", "NEXT"]
  });

  assert.ok(calls.every(call => call.authToken === "TEST_TOKEN"));
  assert.deepEqual(calls.map(call => call.waybillId), [
    "OK", "EMPTY", "FAIL", "NEXT"
  ]);
  assert.deepEqual(delays, [BATCH_DELAY_MS]);
  assert.equal(result.success, true);
  assert.equal(result.totalRequested, 4);
  assert.equal(result.totalSuccess, 2);
  assert.equal(result.totalNotFound, 1);
  assert.equal(result.totalFailed, 1);
  assert.equal(
    result.data.filter(item => item.status === "success").length,
    4
  );
  assert.deepEqual(
    result.data.find(item => item.status === "not_found"),
    { sourceWaybill: "EMPTY", status: "not_found" }
  );
  assert.deepEqual(result.errors, [{
    sourceWaybill: "FAIL",
    status: "failed",
    error: "Safe mock failure"
  }]);
});

test("abnormal piece batch never exceeds concurrency three", async () => {
  let active = 0;
  let maximumActive = 0;
  const service = createAbnormalPieceService({
    getAuthToken: () => "TEST_TOKEN",
    delayFn: async () => {},
    scrapeAbnormalPieceFn: async ({ waybillId }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setImmediate(resolve));
      active -= 1;
      return { data: [mapAbnormalPieceRecord({ waybillId })] };
    }
  });

  await service.getAbnormalPieceBatch({
    waybills: ["1", "2", "3", "4", "5", "6", "7"]
  });
  assert.equal(maximumActive, 3);
});

test("abnormal piece rejects more than 500 unique waybills", () => {
  assert.equal(
    normalizeWaybills(Array.from({ length: 500 }, (_, index) => index)).length,
    500
  );
  assert.throws(
    () => normalizeWaybills(Array.from({ length: 501 }, (_, index) => index)),
    error => error.code === "WAYBILL_LIMIT_EXCEEDED"
  );
});

test("abnormal piece controller returns consistent success and validation responses", async () => {
  let received;
  const controller = createAbnormalPieceController({
    abnormalPieceService: {
      async getAbnormalPieceBatch(options) {
        received = options;
        return {
          success: true,
          totalRequested: 0,
          totalSuccess: 0,
          totalNotFound: 0,
          totalFailed: 0,
          data: [],
          errors: []
        };
      }
    }
  });
  const response = createMockResponse();
  await controller.getAbnormalPieceBatch({
    body: { waybills: ["TEST001"] }
  }, response);
  assert.deepEqual(received, { waybills: ["TEST001"] });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);

  const invalidError = new TypeError("waybills harus berupa array");
  invalidError.code = "INVALID_WAYBILLS";
  const invalidController = createAbnormalPieceController({
    abnormalPieceService: {
      async getAbnormalPieceBatch() {
        throw invalidError;
      }
    }
  });
  const invalidResponse = createMockResponse();
  await invalidController.getAbnormalPieceBatch({ body: {} }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, {
    success: false,
    error: "waybills harus berupa array"
  });
});

test("abnormal piece service rejects a missing auth token", async () => {
  const service = createAbnormalPieceService({
    getAuthToken: () => ""
  });
  await assert.rejects(
    service.getAbnormalPieceBatch({ waybills: ["TEST001"] }),
    error => error.code === "TOKEN_EMPTY"
  );
});
