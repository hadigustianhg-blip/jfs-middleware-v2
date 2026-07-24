"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAgingSignController,
  createSensitiveController
} = require("../src/controllers");
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

async function withoutErrorOutput(callback) {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = originalError;
  }
}

test("aging controller reads date and preserves success response", async () => {
  let received;
  const controller = createAgingSignController({
    agingSignService: {
      async getAgingSign(options) {
        received = options;
        return { data: [{ networkName: "OUTLET001" }] };
      }
    }
  });
  const res = createMockResponse();

  await controller.getAgingSign({
    query: { date: "2026-07-24" }
  }, res);

  assert.deepEqual(received, { date: "2026-07-24" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    total: 1,
    data: [{ networkName: "OUTLET001" }]
  });
});

test("aging controller preserves empty and error contracts", async () => {
  let defaultOptions;
  const emptyController = createAgingSignController({
    agingSignService: {
      async getAgingSign(options) {
        defaultOptions = options;
        return { data: [] };
      }
    }
  });
  const emptyResponse = createMockResponse();
  await emptyController.getAgingSign({ query: {} }, emptyResponse);
  assert.deepEqual(emptyResponse.body, {
    success: true,
    total: 0,
    data: []
  });
  assert.deepEqual(defaultOptions, { date: getTodayJakarta() });

  const errorController = createAgingSignController({
    agingSignService: {
      async getAgingSign() {
        throw new Error("mock failure");
      }
    }
  });
  const errorResponse = createMockResponse();
  await withoutErrorOutput(() =>
    errorController.getAgingSign({ query: {} }, errorResponse)
  );
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, {
    error: "Gagal ambil aging sign",
    detail: "mock failure"
  });
});

test("sensitive controller reads waybill and preserves responses", async () => {
  let received;
  const controller = createSensitiveController({
    sensitiveService: {
      async getSensitiveDetail(options) {
        received = options;
        return { data: { waybillNo: "TEST000001" } };
      }
    }
  });
  const res = createMockResponse();

  await controller.getSensitiveDetail({
    query: { waybillNo: "TEST000001" }
  }, res);

  assert.deepEqual(received, { waybillNo: "TEST000001" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: { waybillNo: "TEST000001" }
  });
});

test("controllers preserve the token-empty response", async () => {
  const tokenError = new Error("Token kosong");
  tokenError.code = "TOKEN_EMPTY";
  const controller = createSensitiveController({
    sensitiveService: {
      async getSensitiveDetail() {
        throw tokenError;
      }
    }
  });
  const res = createMockResponse();

  await controller.getSensitiveDetail({ query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Token kosong" });
});

test("sensitive controller preserves its public error contract", async () => {
  const controller = createSensitiveController({
    sensitiveService: {
      async getSensitiveDetail() {
        throw new Error("mock failure");
      }
    }
  });
  const res = createMockResponse();

  await withoutErrorOutput(() =>
    controller.getSensitiveDetail({ query: {} }, res)
  );
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    error: "mock failure"
  });
});

test("controller responses never expose raw upstream secrets", async () => {
  const upstreamError = new Error("Safe upstream failure");
  upstreamError.response = {
    data: {
      authorization: "Bearer SECRET_TOKEN",
      cookie: "session=SECRET_SESSION"
    }
  };
  const agingController = createAgingSignController({
    agingSignService: {
      async getAgingSign() {
        throw upstreamError;
      }
    }
  });
  const sensitiveController = createSensitiveController({
    sensitiveService: {
      async getSensitiveDetail() {
        throw upstreamError;
      }
    }
  });
  const agingResponse = createMockResponse();
  const sensitiveResponse = createMockResponse();

  await withoutErrorOutput(() =>
    agingController.getAgingSign({ query: {} }, agingResponse)
  );
  await withoutErrorOutput(() =>
    sensitiveController.getSensitiveDetail({ query: {} }, sensitiveResponse)
  );

  const output = JSON.stringify([
    agingResponse.body,
    sensitiveResponse.body
  ]);
  assert.doesNotMatch(output, /SECRET_TOKEN|SECRET_SESSION/);
  assert.equal(agingResponse.statusCode, 500);
  assert.equal(sensitiveResponse.statusCode, 500);
});
