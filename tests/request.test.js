"use strict";

const http = require("node:http");
const test = require("node:test");
const assert = require("node:assert/strict");
const { externalRequest } = require("../src/utils/request");

async function createMockServer(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

async function withoutRequestLogs(callback) {
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    return await callback();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

test("returns parsed JSON from a successful request", async () => {
  const mock = await createMockServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ success: true }));
  });

  try {
    const response = await externalRequest({
      url: mock.url,
      retries: 0
    });
    assert.deepEqual(response.data, { success: true });
    assert.equal(response.status, 200);
  } finally {
    await mock.close();
  }
});

test("classifies a timeout", async () => {
  const mock = await createMockServer((_req, res) => {
    setTimeout(() => res.end("{}"), 100);
  });

  try {
    await assert.rejects(
      externalRequest({
        url: mock.url,
        timeoutMs: 10,
        retries: 0
      }),
      error => error.code === "UPSTREAM_TIMEOUT" && error.isTimeout
    );
  } finally {
    await mock.close();
  }
});

test("does not retry HTTP 401", async () => {
  let requestCount = 0;
  const mock = await createMockServer((_req, res) => {
    requestCount += 1;
    res.statusCode = 401;
    res.end(JSON.stringify({ code: 401 }));
  });

  try {
    await assert.rejects(
      externalRequest({
        url: mock.url,
        retries: 2,
        retryDelayMs: 1
      }),
      error => error.code === "UNAUTHORIZED" && error.status === 401
    );
    assert.equal(requestCount, 1);
  } finally {
    await mock.close();
  }
});

test("retries HTTP 503 within the configured limit", async () => {
  let requestCount = 0;
  const mock = await createMockServer((_req, res) => {
    requestCount += 1;
    res.statusCode = requestCount === 1 ? 503 : 200;
    res.end(JSON.stringify({ attempt: requestCount }));
  });

  try {
    const response = await externalRequest({
      url: mock.url,
      retries: 1,
      retryDelayMs: 1
    });
    assert.deepEqual(response.data, { attempt: 2 });
    assert.equal(requestCount, 2);
  } finally {
    await mock.close();
  }
});

test("does not expose sensitive headers in logs", async () => {
  const mock = await createMockServer((_req, res) => {
    res.statusCode = 401;
    res.end("{}");
  });
  const originalError = console.error;
  let output = "";
  console.error = value => {
    output += value;
  };

  try {
    await assert.rejects(
      externalRequest({
        url: mock.url,
        headers: {
          authorization: "Bearer private-value",
          authtoken: "private-token",
          cookie: "private-cookie"
        },
        retries: 0
      })
    );
  } finally {
    console.error = originalError;
    await mock.close();
  }

  assert.doesNotMatch(output, /private-value|private-token|private-cookie/);
  assert.match(output, /\[REDACTED\]/);
});

test("classifies invalid JSON", async () => {
  const mock = await createMockServer((_req, res) => {
    res.setHeader("content-type", "text/plain");
    res.end("not-json");
  });

  try {
    await assert.rejects(
      externalRequest({
        url: mock.url,
        retries: 0
      }),
      error => error.code === "INVALID_JSON" && error.isUpstream
    );
  } finally {
    await mock.close();
  }
});

for (const retryableStatus of [429, 502, 504]) {
  test(`retries HTTP ${retryableStatus} once and then succeeds`, async () => {
    let requestCount = 0;
    const mock = await createMockServer((_req, res) => {
      requestCount += 1;
      res.statusCode = requestCount === 1 ? retryableStatus : 200;
      res.end(JSON.stringify({ attempt: requestCount }));
    });

    try {
      const response = await withoutRequestLogs(() =>
        externalRequest({
          url: mock.url,
          retries: 1,
          retryDelayMs: 1
        })
      );
      assert.equal(response.data.attempt, 2);
      assert.equal(requestCount, 2);
    } finally {
      await mock.close();
    }
  });
}

for (const nonRetryableStatus of [400, 403, 500]) {
  test(`does not retry HTTP ${nonRetryableStatus}`, async () => {
    let requestCount = 0;
    const mock = await createMockServer((_req, res) => {
      requestCount += 1;
      res.statusCode = nonRetryableStatus;
      res.end(JSON.stringify({ code: nonRetryableStatus }));
    });

    try {
      await assert.rejects(
        withoutRequestLogs(() =>
          externalRequest({
            url: mock.url,
            retries: 2,
            retryDelayMs: 1
          })
        ),
        error =>
          error.status === nonRetryableStatus &&
          error.isUpstream === true &&
          error.isTimeout === false
      );
      assert.equal(requestCount, 1);
    } finally {
      await mock.close();
    }
  });
}

test("retries a connection reset and respects the retry limit", async () => {
  let requestCount = 0;
  const mock = await createMockServer((req, res) => {
    requestCount += 1;
    if (requestCount === 1) {
      req.socket.destroy();
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });

  try {
    const response = await withoutRequestLogs(() =>
      externalRequest({
        url: mock.url,
        retries: 1,
        retryDelayMs: 1
      })
    );
    assert.deepEqual(response.data, { success: true });
    assert.equal(requestCount, 2);
  } finally {
    await mock.close();
  }
});

test("never exceeds the configured retry count", async () => {
  let requestCount = 0;
  const mock = await createMockServer((_req, res) => {
    requestCount += 1;
    res.statusCode = 503;
    res.end("{}");
  });

  try {
    await assert.rejects(
      withoutRequestLogs(() =>
        externalRequest({
          url: mock.url,
          retries: 2,
          retryDelayMs: 1
        })
      ),
      error => error.status === 503
    );
    assert.equal(requestCount, 3);
  } finally {
    await mock.close();
  }
});

test("classifies an empty body as invalid JSON", async () => {
  const mock = await createMockServer((_req, res) => {
    res.end("");
  });

  try {
    await assert.rejects(
      withoutRequestLogs(() =>
        externalRequest({
          url: mock.url,
          retries: 0
        })
      ),
      error =>
        error.code === "INVALID_JSON" &&
        error.status === 200 &&
        error.isUpstream === true
    );
  } finally {
    await mock.close();
  }
});

test("request errors expose safe metadata without request headers", async () => {
  const mock = await createMockServer((_req, res) => {
    res.statusCode = 500;
    res.end("{}");
  });

  try {
    await assert.rejects(
      withoutRequestLogs(() =>
        externalRequest({
          url: mock.url,
          headers: {
            authorization: "Bearer SECRET_TOKEN"
          },
          retries: 0
        })
      ),
      error => {
        assert.equal(error.code, "UPSTREAM_HTTP_ERROR");
        assert.equal(error.status, 500);
        assert.equal(error.isTimeout, false);
        assert.equal(error.isUpstream, true);
        assert.equal(error.headers, undefined);
        assert.doesNotMatch(error.message, /SECRET_TOKEN/);
        return true;
      }
    );
  } finally {
    await mock.close();
  }
});
