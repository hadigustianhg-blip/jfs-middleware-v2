"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/aging-sign.json");
const {
  AGING_SIGN_URL,
  mapAgingSignRecord,
  scrapeAgingSign
} = require("../src/scrapers/aging-sign.scraper");

function legacyMap(item) {
  return {
    signTimelyTotal: item.signTimelyTotal || 0,
    networkName: item.networkName || "",
    signDelayOtherTotal: item.signDelayOtherTotal || 0,
    signTimelyRate: item.signTimelyRate || "0%",
    problemOtherTotal: item.problemOtherTotal || 0,
    queryTime: item.queryTime || "",
    sendCenterTotal: item.sendCenterTotal || 0,
    signDelayNoSignTotal: item.signDelayNoSignTotal || 0
  };
}

test("aging sign passes the legacy request configuration", async () => {
  let requestOptions;
  const result = await scrapeAgingSign({
    date: "2026-07-24",
    authToken: "TEST_TOKEN",
    requestFn: async options => {
      requestOptions = options;
      return { data: fixture };
    }
  });

  const url = new URL(requestOptions.url);
  assert.equal(requestOptions.method, "POST");
  assert.equal(
    `${url.origin}${url.pathname}`,
    "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination"
  );
  assert.equal(
    url.searchParams.get("sqlCode"),
    "realtime_bus_aging_sign_sum_nd"
  );
  assert.ok(url.searchParams.has("dcr_key"));
  assert.equal(requestOptions.body.beginDate, "2026-07-24");
  assert.equal(requestOptions.body.endDate, "2026-07-24");
  assert.equal(requestOptions.body.current, 1);
  assert.equal(requestOptions.body.size, 20);
  assert.equal(requestOptions.headers.Authtoken, "TEST_TOKEN");
  assert.equal(requestOptions.headers.Routename, "Bd-theme-42cb1bb7-3560-47e0-923a-f87ea5f7b1fe");
  assert.equal(result.data.length, 2);
});

test("aging sign mapping is equivalent to the legacy mapping", () => {
  for (const record of fixture.data.records) {
    assert.deepEqual(mapAgingSignRecord(record), legacyMap(record));
  }
});

test("aging sign handles empty and missing records", async () => {
  const empty = await scrapeAgingSign({
    date: "2026-07-24",
    authToken: "TEST_TOKEN",
    requestFn: async () => ({ data: { data: {} } })
  });
  assert.deepEqual(empty, { data: [] });
  assert.deepEqual(mapAgingSignRecord({}), legacyMap({}));
});

test("aging sign propagates an upstream error", async () => {
  const upstreamError = new Error("mock upstream failure");
  await assert.rejects(
    scrapeAgingSign({
      date: "2026-07-24",
      authToken: "TEST_TOKEN",
      requestFn: async () => {
        throw upstreamError;
      }
    }),
    error => error === upstreamError
  );
});

test("aging sign URL remains the legacy upstream URL", () => {
  assert.match(AGING_SIGN_URL, /^https:\/\/jfsgw\.jtcargo\.co\.id\//);
});
