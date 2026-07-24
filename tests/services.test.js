"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAgingSignService,
  createSensitiveService
} = require("../src/services");

test("aging sign service forwards options and returns scraper output", async () => {
  let received;
  const expected = { data: [{ networkName: "OUTLET001" }] };
  const service = createAgingSignService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeAgingSignFn: async options => {
      received = options;
      return expected;
    }
  });

  const result = await service.getAgingSign({ date: "2026-07-24" });
  assert.deepEqual(received, {
    date: "2026-07-24",
    authToken: "TEST_TOKEN"
  });
  assert.strictEqual(result, expected);
});

test("aging sign service propagates scraper errors", async () => {
  const expectedError = new Error("mock failure");
  const service = createAgingSignService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeAgingSignFn: async () => {
      throw expectedError;
    }
  });

  await assert.rejects(
    service.getAgingSign({ date: "2026-07-24" }),
    error => error === expectedError
  );
});

test("sensitive service forwards options and returns scraper output", async () => {
  let received;
  const expected = { data: { waybillNo: "TEST000001" } };
  const service = createSensitiveService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeSensitiveDetailFn: async options => {
      received = options;
      return expected;
    }
  });

  const result = await service.getSensitiveDetail({
    waybillNo: "TEST000001"
  });
  assert.deepEqual(received, {
    waybillNo: "TEST000001",
    authToken: "TEST_TOKEN"
  });
  assert.strictEqual(result, expected);
});

test("sensitive service propagates scraper errors", async () => {
  const expectedError = new Error("mock failure");
  const service = createSensitiveService({
    getAuthToken: () => "TEST_TOKEN",
    scrapeSensitiveDetailFn: async () => {
      throw expectedError;
    }
  });

  await assert.rejects(
    service.getSensitiveDetail({ waybillNo: "TEST000001" }),
    error => error === expectedError
  );
});

test("services reject a missing token before calling a scraper", async () => {
  let calls = 0;
  const service = createAgingSignService({
    getAuthToken: () => "",
    scrapeAgingSignFn: async () => {
      calls += 1;
      return { data: [] };
    }
  });

  await assert.rejects(
    service.getAgingSign({ date: "2026-07-24" }),
    error => error.code === "TOKEN_EMPTY"
  );
  assert.equal(calls, 0);
});
