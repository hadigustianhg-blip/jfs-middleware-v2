"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INVENTORY_DETAIL_SQL_CODE,
  INVENTORY_DETAIL_ROUTE_NAME,
  INVENTORY_DETAIL_URL,
  PAGE_DELAY_MS,
  buildInventoryDetailHeaders,
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
    billCode: "TEST000001",
    isOverDate: "",
    queryFlag: "2",
    beginDate: "2026-07-01 00:00:00",
    endDate: "2026-07-02 23:59:59",
    operateSiteType: "all",
    expressTypeCode: "",
    codNeed: "",
    invOverTm: "",
    shipHour: "",
    customerCode: "",
    isRefund: "",
    sqlCode: "realtime_inv_man_dtl",
    current: 2,
    size: 100,
    convertResultFromDictionCode:
      "is_receiver_pay|124,isProblemPiece|124,cod_need|124,is_refund|124",
    convertResultFromDictionOriCode: "",
    paginationSearchType: "list",
    countryId: "1"
  });
  assert.equal(INVENTORY_DETAIL_SQL_CODE, "realtime_inv_man_dtl");
});

test("inventory detail headers match required JFS report headers", () => {
  const headers = buildInventoryDetailHeaders("TEST_TOKEN");

  assert.deepEqual(headers, {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "id,en-US;q=0.9,en;q=0.8",
    "Cache-Control": "max-age=2, must-revalidate",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: "TEST_TOKEN",
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: INVENTORY_DETAIL_ROUTE_NAME,
    "User-Agent": "Mozilla/5.0"
  });
  assert.equal(
    INVENTORY_DETAIL_ROUTE_NAME,
    "Bd-theme-4d718ae8-fa85-4edc-b98c-1a0f75e5f9f3|businessIndicatorIndex"
  );
  assert.equal(headers.Cookie, undefined);
  assert.equal(headers.Priority, undefined);
  assert.equal(headers["Sec-CH-UA"], undefined);
});

test("inventory detail maps raw JFS record fields and numeric values", () => {
  const mapped = mapInventoryDetailRecord({
    proxy_area_name: "Bandung",
    operate_scantime_1: "2026-07-25 09:50:49",
    take_proxy_area_name: "DKI Jakarta",
    cod_need: "ya",
    operate_scantime_2: "2026-07-25 09:50:49",
    proble_type_subject_name: "Kategori Pelanggan",
    is_receiver_pay: "tidak",
    dest_proxy_area_name: "Bandung",
    package_number: "1",
    inventoryHours: 48,
    operate_site_type: "dalam perjalanan",
    abnormal_reg_time: "2026-07-26 13:31:45",
    take_scantime: "2026-07-22 21:24:59",
    SEND_NEXTSTATION: "SUM001A",
    customer_code: "J0086027538",
    is_refund: "tidak",
    take_site_name: "JKT098A",
    goods_name: "Bingkai foto",
    destination_distribution_name: "GW-Bandung",
    second_level_type_name: "Penerima tidak dapat dihubungi",
    destination_site_name: "SUM001A",
    waybill_status: "sedang delivery",
    operate_site_name: "SUM001A",
    weight: "9.00",
    volume: "0.000",
    express_type_name: "FastTrack",
    abnormal_remark: "Penerima tidak dapat dihubungi",
    ship_hour: "",
    transitHours: 1,
    name: "TikTok",
    billcode: "TEST570520810340",
    first_distribution_name: "GW-Jakarta",
    deliver_count: "3",
    dispatch_name: "Kirim",
    isProblemPiece: "tidak"
  });

  assert.deepEqual(mapped, {
    billCode: "TEST570520810340",
    customerName: "TikTok",
    customerCode: "J0086027538",
    goodsName: "Bingkai foto",
    packageNumber: 1,
    weight: 9,
    volume: 0,
    inventoryHours: 48,
    transitHours: 1,
    codNeed: "ya",
    isReceiverPay: "tidak",
    isRefund: "tidak",
    isProblemPiece: "tidak",
    waybillStatus: "sedang delivery",
    operateSiteType: "dalam perjalanan",
    operateSiteName: "SUM001A",
    destinationSiteName: "SUM001A",
    sendNextStation: "SUM001A",
    problemCategory: "Kategori Pelanggan",
    problemType: "Penerima tidak dapat dihubungi",
    abnormalRemark: "Penerima tidak dapat dihubungi",
    takeScanTime: "2026-07-22 21:24:59",
    operateScanTime1: "2026-07-25 09:50:49",
    operateScanTime2: "2026-07-25 09:50:49",
    abnormalRegisterTime: "2026-07-26 13:31:45",
    proxyAreaName: "Bandung",
    takeProxyAreaName: "DKI Jakarta",
    destinationProxyAreaName: "Bandung",
    takeSiteName: "JKT098A",
    firstDistributionName: "GW-Jakarta",
    destinationDistributionName: "GW-Bandung",
    expressTypeName: "FastTrack",
    deliverCount: 3,
    dispatchName: "Kirim",
    shipHour: ""
  });
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
  assert.equal(
    requests[0].headers.Routename,
    INVENTORY_DETAIL_ROUTE_NAME
  );
  assert.equal(requests[1].body.current, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.data.length, 3);
  assert.deepEqual(Object.keys(result.data[0]), [
    "billCode", "customerName", "customerCode", "goodsName", "packageNumber",
    "weight", "volume", "inventoryHours", "transitHours", "codNeed",
    "isReceiverPay", "isRefund", "isProblemPiece", "waybillStatus",
    "operateSiteType", "operateSiteName", "destinationSiteName",
    "sendNextStation", "problemCategory", "problemType", "abnormalRemark",
    "takeScanTime", "operateScanTime1", "operateScanTime2",
    "abnormalRegisterTime", "proxyAreaName", "takeProxyAreaName",
    "destinationProxyAreaName", "takeSiteName", "firstDistributionName",
    "destinationDistributionName", "expressTypeName", "deliverCount",
    "dispatchName", "shipHour"
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
