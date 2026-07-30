"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DETAIL_URL, LIST_URL, mapListOrder, scrapeOrderDetail, scrapeOrderList
} = require("../src/scrapers/order-scheduling.scraper");

test("list-only sync paginates without requesting any detail", async () => {
  const urls = [];
  const requestFn = async options => {
    urls.push(options.url);
    return { data: { data: { records: [{ id: "one", waybillId: "WB1" }] } } };
  };
  const data = await scrapeOrderList({
    startTime: "2026-07-30 00:00:00", endTime: "2026-07-30 23:59:59",
    authToken: "test-token", requestFn
  });
  assert.equal(data.length, 1);
  assert.deepEqual(urls, [LIST_URL]);
  assert.ok(!urls.includes(DETAIL_URL));
});

test("N list orders do not create N detail requests", async () => {
  let details = 0;
  const records = Array.from({ length: 10 }, (_, index) => ({ id: String(index), waybillId: `WB${index}` }));
  await scrapeOrderList({
    startTime: "start", endTime: "end", authToken: "token",
    requestFn: async options => {
      if (options.url === DETAIL_URL) details += 1;
      return { data: { data: { records } } };
    }
  });
  assert.equal(details, 0);
});

test("single detail request maps only the required sensitive fields", async () => {
  let requests = 0;
  const result = await scrapeOrderDetail({
    orderId: "order-1", authToken: "token",
    requestFn: async options => {
      requests += 1;
      assert.equal(options.params.id, "order-1");
      return { data: { data: {
        senderName: "Full Name", senderMobilePhone: "08123",
        senderDetailedAddress: "Full Address", pickNetworkCode: "OUT001",
        goodsName: "Goods"
      } } };
    }
  });
  assert.equal(requests, 1);
  assert.deepEqual(result, {
    customerName: "Full Name", customerPhone: "08123",
    pickupAddress: "Full Address", outletCode: "OUT001", goodsName: "Goods"
  });
});

test("list mapping keeps masked source fields and actual stable identifiers", () => {
  assert.deepEqual(mapListOrder({
    id: "order-1", waybillId: "WB1", customerCode: "C1",
    senderName: "A***", senderMobilePhone: "081****",
    senderDetailedAddress: "Jalan ***", orderSourceName: "Marketplace",
    goodsName: "Goods", packageTotalWeight: "2.5", orderStatusName: "Created",
    pickNetworkCode: "OUT001", inputTime: "2026-07-30 10:00:00"
  }), {
    orderId: "order-1", waybillId: "WB1", customerId: "C1",
    senderNameMasked: "A***", senderPhoneMasked: "081****",
    pickupAddressMasked: "Jalan ***", sourcePlatform: "Marketplace",
    goodsName: "Goods", weight: 2.5, status: "Created",
    outletCode: "OUT001", networkCode: "OUT001",
    businessDate: "2026-07-30", inputTime: "2026-07-30 10:00:00",
    updatedTime: "2026-07-30 10:00:00"
  });
});
