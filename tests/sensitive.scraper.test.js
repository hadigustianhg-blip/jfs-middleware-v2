"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/sensitive.json");
const {
  SENSITIVE_DETAIL_URL,
  mapSensitiveDetail,
  scrapeSensitiveDetail
} = require("../src/scrapers/sensitive.scraper");

function legacyMap(item = {}) {
  return {
    waybillNo: item.waybillNo || "",
    dispatchTime: item.dispatchTime || "",
    dispatchStaffName: item.dispatchStaffName || "",
    receiverName: item.receiverName || "",
    receiverMobilePhone: item.receiverMobilePhone || "",
    receiverTelphone: item.receiverTelphone || "",
    receiverDetailedAddress: item.receiverDetailedAddress || "",
    chargeWeight: item.chargeWeight || 0,
    abnormalName: item.abnormalName || "",
    updateTime: item.updateTime || "",
    codMoney: item.codMoney || 0,
    goodsName: item.goodsName || ""
  };
}

test("sensitive detail passes the legacy request configuration", async () => {
  let requestOptions;
  const result = await scrapeSensitiveDetail({
    waybillNo: "TEST000001",
    authToken: "TEST_TOKEN",
    requestFn: async options => {
      requestOptions = options;
      return { data: fixture };
    }
  });

  assert.equal(requestOptions.method, "POST");
  assert.equal(
    requestOptions.url,
    "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/sensitiveDetailByWaybillNo"
  );
  assert.deepEqual(requestOptions.params, {
    waybillNo: "TEST000001",
    chanel: 2
  });
  assert.deepEqual(requestOptions.data, { countryId: "1" });
  assert.equal(requestOptions.headers.Authtoken, "TEST_TOKEN");
  assert.equal(requestOptions.headers.Routename, "dispatchWaybill");
  assert.deepEqual(result.data, legacyMap(fixture.data));
});

test("sensitive mapping is equivalent to the legacy mapping", () => {
  assert.deepEqual(mapSensitiveDetail(fixture.data), legacyMap(fixture.data));
  assert.deepEqual(mapSensitiveDetail({}), legacyMap({}));
});

test("sensitive detail handles a missing upstream object", async () => {
  const result = await scrapeSensitiveDetail({
    waybillNo: "TEST000001",
    authToken: "TEST_TOKEN",
    requestFn: async () => ({ data: {} })
  });
  assert.deepEqual(result, { data: legacyMap({}) });
});

test("sensitive detail propagates an upstream error", async () => {
  const upstreamError = new Error("mock upstream failure");
  await assert.rejects(
    scrapeSensitiveDetail({
      waybillNo: "TEST000001",
      authToken: "TEST_TOKEN",
      requestFn: async () => {
        throw upstreamError;
      }
    }),
    error => error === upstreamError
  );
});

test("sensitive detail URL remains the legacy upstream URL", () => {
  assert.equal(
    SENSITIVE_DETAIL_URL,
    "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/sensitiveDetailByWaybillNo"
  );
});
