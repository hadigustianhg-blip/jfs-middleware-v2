"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment-timezone");
const {
  createIbkReportController,
  resolveIbkDateRange
} = require("../src/controllers/ibk-report.controller");
const {
  buildIbkHeaders,
  buildIbkPayload,
  scrapeIbkReport
} = require("../src/scrapers/ibk-report.scraper");

function responseMock() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function makeController(service) {
  return createIbkReportController({
    ibkReportService: service,
    now: () => moment.tz("2026-07-30 12:00:00", "Asia/Jakarta")
  });
}

async function invoke(query, service = {
  async getIbkReport() {
    return { data: [], pageCount: 1 };
  }
}) {
  const res = responseMock();
  await makeController(service).getIbkReport({ query }, res);
  return res;
}

test("accepts custom dates and maps inclusive source times", async () => {
  let received;
  const res = await invoke({
    startDate: "2026-07-01",
    endDate: "2026-07-30"
  }, {
    async getIbkReport(options) {
      received = options;
      return { data: [], pageCount: 1 };
    }
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, {
    startTime: "2026-07-01 00:00:00",
    endTime: "2026-07-30 23:59:59"
  });
  assert.equal(res.body.startDate, "2026-07-01");
  assert.equal(res.body.endDate, "2026-07-30");
});

test("uses yesterday through today in Asia/Jakarta by default", () => {
  assert.deepEqual(
    resolveIbkDateRange(
      {},
      moment.tz("2026-07-30 00:05:00", "Asia/Jakarta")
    ),
    {
      startDate: "2026-07-29",
      endDate: "2026-07-30",
      startTime: "2026-07-29 00:00:00",
      endTime: "2026-07-30 23:59:59"
    }
  );
});

for (const [name, query, message] of [
  ["rejects only startDate", { startDate: "2026-07-01" }, "Rentang tanggal tidak valid."],
  ["rejects only endDate", { endDate: "2026-07-30" }, "Rentang tanggal tidak valid."],
  ["rejects invalid format", { startDate: "01-07-2026", endDate: "2026-07-30" }, "Rentang tanggal tidak valid."],
  ["rejects invalid calendar date", { startDate: "2026-02-30", endDate: "2026-03-01" }, "Rentang tanggal tidak valid."],
  ["rejects reversed range", { startDate: "2026-07-30", endDate: "2026-07-01" }, "Rentang tanggal tidak valid."],
  ["rejects more than 31 inclusive days", { startDate: "2026-06-29", endDate: "2026-07-30" }, "Rentang maksimal 31 hari."]
]) {
  test(name, async () => {
    const res = await invoke(query);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { success: false, message });
  });
}

test("31 inclusive calendar days are accepted", () => {
  const range = resolveIbkDateRange({
    startDate: "2026-07-01",
    endDate: "2026-07-31"
  });
  assert.equal(range.endTime, "2026-07-31 23:59:59");
});

test("payload, headers and query pagination match the existing JFS request", async () => {
  const requests = [];
  await scrapeIbkReport({
    startTime: "2026-07-01 00:00:00",
    endTime: "2026-07-30 23:59:59",
    authToken: "TEST_AUTH_TOKEN",
    requestFn: async request => {
      requests.push(request);
      return { data: { data: { records: [] } } };
    }
  });

  assert.deepEqual(requests[0].params, { current: 1, size: 100 });
  assert.deepEqual(requests[0].body, buildIbkPayload({
    current: 1,
    size: 100,
    startTime: "2026-07-01 00:00:00",
    endTime: "2026-07-30 23:59:59"
  }));
  assert.equal(requests[0].headers.Routename, "advancePaymentQuery");
  assert.equal(buildIbkHeaders("TEST_AUTH_TOKEN").Authtoken, "TEST_AUTH_TOKEN");
});

test("fetches every source page and preserves the existing data contract", async () => {
  const pages = [];
  const result = await scrapeIbkReport({
    startTime: "2026-07-01 00:00:00",
    endTime: "2026-07-30 23:59:59",
    authToken: "TEST_AUTH_TOKEN",
    requestFn: async request => {
      const page = request.params.current;
      pages.push(page);
      const records = page === 1
        ? Array.from({ length: 100 }, (_, index) => ({
          id: `TX-${index}`,
          networkName: "OUTLET",
          tradeType: 1,
          feeTypeName: "Biaya",
          feeItemTypeName: "COD",
          date: "2026-07-01 10:00:00",
          amount: index
        }))
        : [{
          id: "TX-100",
          networkName: "OUTLET",
          tradeType: 2,
          feeTypeName: "Biaya",
          feeItemTypeName: "DFOD",
          date: "2026-07-30 23:59:59",
          amount: 100
        }];
      return { data: { data: { records, total: 101 } } };
    }
  });

  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.pageCount, 2);
  assert.equal(result.data.length, 101);
  assert.deepEqual(Object.keys(result.data[0]), [
    "networkName",
    "tradeType",
    "feeTypeName",
    "feeItemTypeName",
    "date",
    "amount"
  ]);
});

test("deduplicates by stable source transaction id", async () => {
  const result = await scrapeIbkReport({
    startTime: "2026-07-01 00:00:00",
    endTime: "2026-07-30 23:59:59",
    authToken: "TEST_AUTH_TOKEN",
    requestFn: async () => ({
      data: {
        data: {
          records: [
            { id: "SAME-ID", date: "2026-07-15", amount: 100 },
            { id: "SAME-ID", date: "2026-07-15", amount: 100 }
          ]
        }
      }
    })
  });
  assert.equal(result.data.length, 1);
});

test("repeated source pages stop safely instead of looping", async () => {
  let requests = 0;
  const records = Array.from({ length: 100 }, (_, index) => ({
    id: `REPEAT-${index}`,
    date: "2026-07-15"
  }));
  const result = await scrapeIbkReport({
    startTime: "2026-07-01 00:00:00",
    endTime: "2026-07-30 23:59:59",
    authToken: "TEST_AUTH_TOKEN",
    requestFn: async () => {
      requests += 1;
      return { data: { data: { records } } };
    }
  });
  assert.equal(requests, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.stoppedReason, "repeated_page");
  assert.equal(result.data.length, 100);
});

test("filters records outside the inclusive requested range", async () => {
  const result = await scrapeIbkReport({
    startTime: "2026-07-01 00:00:00",
    endTime: "2026-07-30 23:59:59",
    authToken: "TEST_AUTH_TOKEN",
    requestFn: async () => ({
      data: {
        data: {
          records: [
            { id: "BEFORE", date: "2026-06-30 23:59:59" },
            { id: "START", date: "2026-07-01 00:00:00" },
            { id: "END", date: "2026-07-30 23:59:59" },
            { id: "AFTER", date: "2026-07-31 00:00:00" }
          ]
        }
      }
    })
  });
  assert.equal(result.data.length, 2);
});

test("timeout returns 504 with a safe response", async () => {
  const timeout = new Error("request timeout SECRET_TOKEN");
  timeout.code = "UPSTREAM_TIMEOUT";
  timeout.isTimeout = true;
  timeout.isUpstream = true;
  const res = await invoke({}, {
    async getIbkReport() {
      const wrapped = new Error("Failed to fetch page 1", { cause: timeout });
      wrapped.code = "PAGE_FETCH_FAILED";
      throw wrapped;
    }
  });
  assert.equal(res.statusCode, 504);
  assert.deepEqual(res.body, {
    success: false,
    message: "Sumber data JFS mengalami timeout."
  });
  assert.doesNotMatch(JSON.stringify(res.body), /SECRET_TOKEN/);
});

test("source 5xx returns 502 without credentials or raw response", async () => {
  const sourceError = new Error("raw SECRET_COOKIE");
  sourceError.isUpstream = true;
  sourceError.status = 500;
  sourceError.response = {
    data: { token: "SECRET_TOKEN", cookie: "SECRET_COOKIE" }
  };
  const res = await invoke({}, {
    async getIbkReport() {
      throw sourceError;
    }
  });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, {
    success: false,
    message: "Sumber data JFS tidak tersedia."
  });
  assert.doesNotMatch(JSON.stringify(res.body), /SECRET_TOKEN|SECRET_COOKIE/);
});

test("invalid pagination returns a safe source failure", async () => {
  await assert.rejects(
    scrapeIbkReport({
      startTime: "2026-07-01 00:00:00",
      endTime: "2026-07-30 23:59:59",
      authToken: "TEST_AUTH_TOKEN",
      requestFn: async () => ({ data: { data: { records: null } } })
    }),
    error => error.code === "PAGE_FETCH_FAILED" &&
      error.cause?.code === "INVALID_PAGINATION"
  );
});
