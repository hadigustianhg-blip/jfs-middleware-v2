"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INVENTORY_DETAIL_SQL_CODE,
  INVENTORY_DETAIL_URL,
  PAGE_DELAY_MS,
  buildInventoryDetailPayload,
  mapInventoryDetailRecord,
  scrapeInventoryDetail
} = require("../src/scrapers/inventory-detail.scraper");
const {
  createInventoryDetailService
} = require("../src/services/inventory-detail.service");
const {
  createInventoryDetailController
} = require("../src/controllers/inventory-detail.controller");

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

test("inventory detail payload follows the JFS report request", () => {
  assert.deepEqual(buildInventoryDetailPayload({
    startDate: "2026-07-01",
    endDate: "2026-07-02",
    billCode: "TEST000001",
    current: 2,
    size: 100
  }), {
    beginDate: "2026-07-01 00:00:00",
    endDate: "2026-07-02 23:59:59",
    billCode: "TEST000001",
    sqlCode: "realtime_inv_man_dtl",
    paginationSearchType: "list",
    operateSiteType: "all",
    queryFlag: "all",
    current: 2,
    size: 100
  });
  assert.equal(INVENTORY_DETAIL_SQL_CODE, "realtime_inv_man_dtl");
});

test("inventory detail paginates, maps output, and delays between pages", async () => {
  const requests = [];
  const delays = [];
  const pageOne = Array.from({ length: 2 }, (_, index) => ({
    billCode: `TEST00000${index + 1}`,
    packageNumber: index + 1,
    weight: index,
    ignored: "not exposed"
  }));

  const result = await scrapeInventoryDetail({
    startDate: "2026-07-01",
    endDate: "2026-07-01",
    billCode: "",
    size: 2,
    maxPage: 5,
    authToken: "TEST_TOKEN",
    delayFn: async milliseconds => delays.push(milliseconds),
    requestFn: async options => {
      requests.push(options);
      const records = options.body.current === 1
        ? pageOne
        : [{ billCode: "TEST000003", weight: 3 }];
      return { data: { data: { records } } };
    }
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(delays, [PAGE_DELAY_MS]);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url, INVENTORY_DETAIL_URL);
  assert.equal(requests[0].headers.Authtoken, "TEST_TOKEN");
  assert.equal(requests[1].body.current, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.data.length, 3);
  assert.deepEqual(Object.keys(result.data[0]), [
    "billCode", "customerName", "goodsName", "packageNumber", "weight",
    "inventoryHours", "codNeed", "waybillStatus", "operateSiteType",
    "operateSiteName", "destinationSiteName", "sendNextStation",
    "problemCategory", "problemType", "abnormalRemark", "takeScanTime",
    "operateScanTime", "abnormalRegisterTime"
  ]);
  assert.equal(result.data[0].weight, 0);
  assert.equal(result.data[0].ignored, undefined);
});

test("inventory detail respects maxPage and handles missing records", async () => {
  let calls = 0;
  const result = await scrapeInventoryDetail({
    startDate: "2026-07-01",
    endDate: "2026-07-01",
    size: 1,
    maxPage: 2,
    authToken: "TEST_TOKEN",
    delayFn: async () => {},
    requestFn: async () => {
      calls += 1;
      return { data: { data: { records: [{ billCode: `TEST${calls}` }] } } };
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.stoppedReason, "max_pages_reached");

  const empty = await scrapeInventoryDetail({
    startDate: "2026-07-01",
    endDate: "2026-07-01",
    authToken: "TEST_TOKEN",
    requestFn: async () => ({ data: { data: {} } })
  });
  assert.deepEqual(empty.data, []);
  assert.deepEqual(mapInventoryDetailRecord({}).billCode, "");
});

test("inventory detail service obtains and forwards the current auth token", async () => {
  let received;
  const service = createInventoryDetailService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeInventoryDetailFn: async options => {
      received = options;
      return { data: [], pageCount: 1 };
    }
  });
  await service.getInventoryDetail({ startDate: "2026-07-01" });
  assert.equal(received.authToken, "TEST_TOKEN");

  const missingTokenService = createInventoryDetailService({
    getAuthToken: () => ""
  });
  await assert.rejects(
    missingTokenService.getInventoryDetail({}),
    error => error.code === "TOKEN_EMPTY"
  );
});

test("inventory detail controller applies defaults and response contract", async () => {
  let received;
  const controller = createInventoryDetailController({
    inventoryDetailService: {
      async getInventoryDetail(options) {
        received = options;
        return { data: [{ billCode: "TEST000001" }], pageCount: 1 };
      }
    }
  });
  const response = createMockResponse();
  await controller.getInventoryDetail({
    query: { startDate: "2026-07-01" }
  }, response);

  assert.deepEqual(received, {
    startDate: "2026-07-01",
    endDate: "2026-07-01",
    billCode: "",
    size: 100,
    maxPage: 100
  });
  assert.deepEqual(response.body, {
    success: true,
    total: 1,
    pages: 1,
    data: [{ billCode: "TEST000001" }]
  });
});

test("inventory detail controller validates dates and pagination limits", async () => {
  const controller = createInventoryDetailController({
    inventoryDetailService: {
      async getInventoryDetail() {
        throw new Error("must not be called");
      }
    }
  });

  for (const query of [
    { startDate: "27-07-2026" },
    { startDate: "2026-07-02", endDate: "2026-07-01" },
    { size: "0" },
    { maxPage: "501" },
    { size: "1.5" }
  ]) {
    const response = createMockResponse();
    await controller.getInventoryDetail({ query }, response);
    assert.equal(response.statusCode, 400);
    assert.ok(response.body.error);
  }
});
