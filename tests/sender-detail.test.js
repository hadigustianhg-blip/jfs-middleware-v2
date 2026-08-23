"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  buildSenderDetailHeaders,
  buildSenderDetailParams,
  mapSenderDetail,
  normalizeSenderPhone,
  scrapeSenderDetail
} = require("../src/scrapers/sender-detail.scraper");
const {
  classifySenderDetailError,
  createSenderDetailController,
  normalizeWaybillNo
} = require("../src/controllers/sender-detail.controller");
const {
  createSenderDetailService
} = require("../src/services/sender-detail.service");
const {
  createSenderDetailRoutes
} = require("../src/routes/sender-detail.routes");

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

function controller(service) {
  return createSenderDetailController({
    senderDetailService: service,
    now: (() => {
      let value = 1000;
      return () => {
        value += 5;
        return value;
      };
    })(),
    createRequestId: () => "request-test"
  });
}

async function invoke(query, service) {
  const res = responseMock();
  await controller(service).getSenderDetail({
    query,
    headers: {}
  }, res);
  return res;
}

test("scraper sends the exact safe upstream request and exposes only three fields", async () => {
  let requestOptions;
  let requests = 0;
  const result = await scrapeSenderDetail({
    waybillNo: "201680658475",
    authToken: "TEST_RUNTIME_TOKEN",
    requestFn: async options => {
      requests += 1;
      requestOptions = options;
      return {
        status: 200,
        data: {
          msg: "ok",
          data: {
            waybillNo: "201680658475",
            senderName: "  Sender Test  ",
            senderMobilePhone: " 08 12-345(678) ",
            senderCityName: "  Kab. Test  ",
            customerId: "INTERNAL",
            staffCode: "PRIVATE",
            token: "NEVER_EXPOSE"
          }
        }
      };
    }
  });

  assert.equal(requests, 1);
  assert.equal(requestOptions.method, "GET");
  assert.equal(
    requestOptions.url,
    "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/detailSecret"
  );
  assert.equal(
    requestOptions.params.toString(),
    "type=senderMobilePhone&waybillNo=201680658475&pageType=1"
  );
  assert.equal(requestOptions.headers.Routename, "sendWaybillSite");
  assert.equal(requestOptions.headers.Authtoken, "TEST_RUNTIME_TOKEN");
  assert.equal(requestOptions.headers.Cookie, undefined);
  assert.equal(requestOptions.headers["sec-ch-ua"], undefined);
  assert.deepEqual(result.data, {
    senderName: "Sender Test",
    senderMobilePhone: "0812345678",
    senderCityName: "Kab. Test"
  });
  assert.deepEqual(Object.keys(result.data), [
    "senderName",
    "senderMobilePhone",
    "senderCityName"
  ]);
  assert.doesNotMatch(JSON.stringify(result), /INTERNAL|PRIVATE|NEVER_EXPOSE/);
});

test("params use URLSearchParams encoding and required constants", () => {
  const params = buildSenderDetailParams("201680658475");
  assert.ok(params instanceof URLSearchParams);
  assert.equal(params.get("type"), "senderMobilePhone");
  assert.equal(params.get("waybillNo"), "201680658475");
  assert.equal(params.get("pageType"), "1");
  assert.equal(
    buildSenderDetailHeaders("RUNTIME_TOKEN")["Content-Type"],
    "application/json;charset=utf-8"
  );
});

test("mapper normalizes whitespace, phone punctuation, empty and non-string fields", () => {
  assert.deepEqual(mapSenderDetail({
    senderName: "  Nama Tetap  ",
    senderMobilePhone: " +62 (812) 345-678 ",
    senderCityName: "  Kota Test "
  }), {
    senderName: "Nama Tetap",
    senderMobilePhone: "+62812345678",
    senderCityName: "Kota Test"
  });
  assert.deepEqual(mapSenderDetail({
    senderName: " ",
    senderMobilePhone: "",
    senderCityName: 123
  }), {
    senderName: null,
    senderMobilePhone: null,
    senderCityName: null
  });
  assert.equal(mapSenderDetail(null), null);
  assert.equal(mapSenderDetail({}), null);
  assert.equal(normalizeSenderPhone("08-12 34"), "081234");
  assert.equal(normalizeSenderPhone("not a phone"), null);
});

test("service obtains the token from getAuthToken and never returns it", async () => {
  let receivedToken;
  const service = createSenderDetailService({
    getAuthToken: () => "RUNTIME_ONLY_TOKEN",
    scrapeSenderDetailFn: async options => {
      receivedToken = options.authToken;
      return {
        data: {
          senderName: "Sender",
          senderMobilePhone: null,
          senderCityName: null
        },
        upstreamStatus: 200
      };
    }
  });
  const result = await service.getSenderDetail({ waybillNo: "201680658475" });
  assert.equal(receivedToken, "RUNTIME_ONLY_TOKEN");
  assert.doesNotMatch(JSON.stringify(result), /RUNTIME_ONLY_TOKEN/);
});

test("valid request returns the stable public response contract", async () => {
  const res = await invoke({ waybillNo: " 201680658475 " }, {
    async getSenderDetail() {
      return {
        data: {
          senderName: "Sender Test",
          senderMobilePhone: "0812345678",
          senderCityName: "Kab. Test"
        },
        upstreamStatus: 200
      };
    }
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      senderName: "Sender Test",
      senderMobilePhone: "0812345678",
      senderCityName: "Kab. Test"
    },
    meta: {
      waybillNo: "201680658475",
      source: "JFS"
    }
  });
});

for (const [label, value] of [
  ["missing", undefined],
  ["empty", "  "],
  ["non-digit", "20168ABC8475"],
  ["too short", "1234567"],
  ["too long", "123456789012345678901"]
]) {
  test(`${label} waybill is rejected without calling the service`, async () => {
    let calls = 0;
    const res = await invoke({ waybillNo: value }, {
      async getSenderDetail() {
        calls += 1;
        return { data: null };
      }
    });
    assert.equal(calls, 0);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      error: {
        code: "INVALID_WAYBILL_NO",
        message: "waybillNo tidak valid"
      }
    });
  });
}

test("normalizer accepts only trimmed reasonable digit-only waybills", () => {
  assert.equal(normalizeWaybillNo(" 201680658475 "), "201680658475");
  assert.equal(normalizeWaybillNo(201680658475), null);
  assert.equal(normalizeWaybillNo("201680658475?x=1"), null);
});

test("null upstream data maps to a safe 404", async () => {
  const res = await invoke({ waybillNo: "201680658475" }, {
    async getSenderDetail() {
      return { data: null, upstreamStatus: 200 };
    }
  });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    error: {
      code: "SENDER_DETAIL_NOT_FOUND",
      message: "Detail pengirim tidak ditemukan"
    }
  });
});

for (const [label, error, status, code] of [
  [
    "missing auth",
    Object.assign(new Error("empty"), { code: "TOKEN_EMPTY" }),
    500,
    "JFS_AUTH_NOT_CONFIGURED"
  ],
  [
    "expired auth",
    Object.assign(new Error("unauthorized"), { code: "UNAUTHORIZED", status: 401 }),
    502,
    "JFS_AUTH_EXPIRED"
  ],
  [
    "timeout",
    Object.assign(new Error("timeout"), { code: "UPSTREAM_TIMEOUT", isTimeout: true }),
    504,
    "JFS_UPSTREAM_TIMEOUT"
  ],
  [
    "upstream 500",
    Object.assign(new Error("upstream"), { code: "UPSTREAM_HTTP_ERROR", status: 500 }),
    502,
    "JFS_UPSTREAM_ERROR"
  ],
  [
    "invalid JSON",
    Object.assign(new Error("invalid"), { code: "INVALID_JSON", status: 200 }),
    502,
    "JFS_UPSTREAM_ERROR"
  ]
]) {
  test(`${label} is mapped without leaking the source error`, async () => {
    const res = await invoke({ waybillNo: "201680658475" }, {
      async getSenderDetail() {
        error.message += " SECRET_VALUE";
        throw error;
      }
    });
    assert.equal(res.statusCode, status);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, code);
    assert.doesNotMatch(JSON.stringify(res.body), /SECRET_VALUE/);
  });
}

test("nested authorization and timeout errors are classified safely", () => {
  const auth = new Error("wrapper", {
    cause: Object.assign(new Error("source"), { response: { status: 403 } })
  });
  const timeout = new Error("wrapper", {
    cause: Object.assign(new Error("source"), { code: "ECONNABORTED" })
  });
  assert.equal(classifySenderDetailError(auth).code, "JFS_AUTH_EXPIRED");
  assert.equal(classifySenderDetailError(timeout).code, "JFS_UPSTREAM_TIMEOUT");
});

test("public route works through a local stub without contacting JFS", async t => {
  const app = express();
  const handler = controller({
    async getSenderDetail({ waybillNo }) {
      return {
        data: {
          senderName: `Sender ${waybillNo.slice(-4)}`,
          senderMobilePhone: null,
          senderCityName: "Kota Test"
        },
        upstreamStatus: 200
      };
    }
  });
  app.use(createSenderDetailRoutes({
    getSenderDetail: handler.getSenderDetail
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();

  const response = await fetch(
    `http://127.0.0.1:${port}/jfs-sender-detail?waybillNo=201680658475`
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      senderName: "Sender 8475",
      senderMobilePhone: null,
      senderCityName: "Kota Test"
    },
    meta: {
      waybillNo: "201680658475",
      source: "JFS"
    }
  });
});
