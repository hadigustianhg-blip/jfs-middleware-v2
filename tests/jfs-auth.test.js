"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  JFS_LOGIN_URL,
  buildLoginHeaders,
  createJfsAuthManager,
  hashPassword
} = require("../src/auth/jfs-auth-manager");
const {
  createJfsAuthController,
  safeKeyMatches
} = require("../src/controllers/jfs-auth.controller");
const {
  executeWithAuthRetry
} = require("../src/utils/auth-retry");
const {
  installAxiosAuthRetry
} = require("../src/auth/axios-auth-retry");

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

function createMockRequest({ key, body = {}, query = {} } = {}) {
  return {
    body,
    query,
    get(name) {
      return name.toLowerCase() === "x-auth-key" ? key : undefined;
    }
  };
}

test("JFS auth manager hashes the original password once and caches token", async () => {
  let received;
  let emittedToken;
  const manager = createJfsAuthManager({
    deviceNo: "TEST_DEVICE",
    onToken: token => {
      emittedToken = token;
    },
    requestFn: async options => {
      received = options;
      return {
        data: {
          data: {
            token: "TEST_LOGIN_TOKEN",
            networkCode: "SUM001A",
            name: "TEST USER"
          }
        }
      };
    }
  });

  const result = await manager.loginWithCredentials(
    "TEST_ACCOUNT",
    "TEST_PASSWORD"
  );

  assert.equal(received.method, "POST");
  assert.equal(received.url, JFS_LOGIN_URL);
  assert.deepEqual(received.headers, buildLoginHeaders());
  assert.deepEqual(Object.keys(received.headers).sort(), [
    "Accept", "Content-Type", "Lang", "Langtype", "Routename", "User-Agent"
  ].sort());
  assert.equal(received.headers["User-Agent"], "Mozilla/5.0");
  assert.equal("Origin" in received.headers, false);
  assert.equal("Referer" in received.headers, false);
  assert.deepEqual(received.body, {
    account: "TEST_ACCOUNT",
    password: hashPassword("TEST_PASSWORD"),
    captchaToken: "",
    deviceNo: "TEST_DEVICE",
    countryId: "1"
  });
  assert.notEqual(received.body.password, "TEST_PASSWORD");
  assert.equal(result.token, "TEST_LOGIN_TOKEN");
  assert.equal(manager.getToken(), "TEST_LOGIN_TOKEN");
  assert.equal(emittedToken, "TEST_LOGIN_TOKEN");
});

test("refresh login reuses the stored hash and deduplicates concurrent calls", async () => {
  const passwords = [];
  let calls = 0;
  const manager = createJfsAuthManager({
    deviceNo: "TEST_DEVICE",
    requestFn: async options => {
      calls += 1;
      passwords.push(options.body.password);
      await new Promise(resolve => setImmediate(resolve));
      return {
        data: {
          data: {
            token: `TEST_TOKEN_${calls}`,
            networkCode: "",
            name: ""
          }
        }
      };
    }
  });
  await manager.loginWithCredentials("TEST_ACCOUNT", "TEST_PASSWORD");
  await Promise.all([manager.refreshLogin(), manager.refreshLogin()]);

  assert.equal(calls, 2);
  assert.equal(passwords[0], hashPassword("TEST_PASSWORD"));
  assert.equal(passwords[1], passwords[0]);
});

test("a raw 32-character hex password is still MD5 hashed exactly once", async () => {
  const rawPassword = "abcdef0123456789abcdef0123456789";
  let sentPassword;
  const manager = createJfsAuthManager({
    requestFn: async options => {
      sentPassword = options.body.password;
      return { data: { data: { token: "TOKEN" } } };
    }
  });
  await manager.loginWithCredentials("ACCOUNT", rawPassword);
  assert.equal(sentPassword, hashPassword(rawPassword));
  assert.notEqual(sentPassword, rawPassword);
});

test("auth endpoint rejects a wrong key without attempting login", async () => {
  let calls = 0;
  const controller = createJfsAuthController({
    getAuthKey: () => "TEST_SHARED_KEY",
    authManager: {
      async loginWithCredentials() {
        calls += 1;
      }
    }
  });
  const response = createMockResponse();
  await controller.login(createMockRequest({
    key: "WRONG_KEY",
    body: {
      account: "TEST_ACCOUNT",
      password: "TEST_PASSWORD"
    }
  }), response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: "UNAUTHORIZED"
  });
  assert.equal(calls, 0);
  assert.equal(safeKeyMatches("", ""), false);
});

test("auth endpoint accepts body credentials and never returns token or password", async () => {
  let received;
  const controller = createJfsAuthController({
    getAuthKey: () => "TEST_SHARED_KEY",
    authManager: {
      async loginWithCredentials(account, password) {
        received = { account, password };
        return {
          token: "TEST_HIDDEN_TOKEN",
          networkCode: "SUM001A",
          name: "TEST USER"
        };
      }
    }
  });
  const response = createMockResponse();
  await controller.login(createMockRequest({
    key: "TEST_SHARED_KEY",
    query: {
      account: "QUERY_ACCOUNT",
      password: "QUERY_PASSWORD"
    },
    body: {
      account: "TEST_ACCOUNT",
      password: "TEST_PASSWORD"
    }
  }), response);

  assert.deepEqual(received, {
    account: "TEST_ACCOUNT",
    password: "TEST_PASSWORD"
  });
  assert.deepEqual(response.body, {
    success: true,
    message: "Login JFS berhasil",
    networkCode: "SUM001A",
    name: "TEST USER"
  });
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /TEST_PASSWORD|TEST_HIDDEN_TOKEN/
  );
});

test("auth endpoint returns only the safe login failure contract", async () => {
  const controller = createJfsAuthController({
    getAuthKey: () => "TEST_SHARED_KEY",
    authManager: {
      async loginWithCredentials() {
        throw new Error("Sensitive upstream detail");
      }
    }
  });
  const response = createMockResponse();
  await controller.login(createMockRequest({
    key: "TEST_SHARED_KEY",
    body: {
      account: "TEST_ACCOUNT",
      password: "TEST_PASSWORD"
    }
  }), response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: "JFS_LOGIN_FAILED"
  });
});

test("scraper operation refreshes on 401 and retries exactly once", async () => {
  const tokens = [];
  let refreshCalls = 0;
  const result = await executeWithAuthRetry({
    getAuthToken: () => "EXPIRED_TEST_TOKEN",
    refreshAuth: async () => {
      refreshCalls += 1;
      return { token: "FRESH_TEST_TOKEN" };
    },
    operation: async token => {
      tokens.push(token);
      if (tokens.length === 1) {
        const error = new Error("Unauthorized");
        error.code = "UNAUTHORIZED";
        error.status = 401;
        throw error;
      }
      return "success";
    }
  });

  assert.equal(result, "success");
  assert.equal(refreshCalls, 1);
  assert.deepEqual(tokens, ["EXPIRED_TEST_TOKEN", "FRESH_TEST_TOKEN"]);
});

test("scraper operation does not retry a second unauthorized response", async () => {
  let operations = 0;
  await assert.rejects(
    executeWithAuthRetry({
      getAuthToken: () => "EXPIRED_TEST_TOKEN",
      refreshAuth: async () => ({ token: "FRESH_TEST_TOKEN" }),
      operation: async () => {
        operations += 1;
        const error = new Error("Unauthorized");
        error.code = "UNAUTHORIZED";
        throw error;
      }
    }),
    error => error.code === "UNAUTHORIZED"
  );
  assert.equal(operations, 2);
});

test("legacy axios requests refresh a 401 once with the new token", async () => {
  let rejectInterceptor;
  let retriedConfig;
  const axiosInstance = async config => {
    retriedConfig = config;
    return { status: 200 };
  };
  axiosInstance.interceptors = {
    response: {
      use(_success, failure) {
        rejectInterceptor = failure;
        return 1;
      }
    }
  };
  const authManager = {
    hasCredentials: () => true,
    async refreshLogin() {
      return { token: "FRESH_TEST_TOKEN" };
    }
  };

  installAxiosAuthRetry(axiosInstance, authManager);
  await rejectInterceptor({
    response: { status: 401 },
    config: {
      url: "https://jfsgw.jtcargo.co.id/test",
      headers: { Authtoken: "EXPIRED_TEST_TOKEN" }
    }
  });

  assert.equal(retriedConfig.__jfsAuthRetried, true);
  assert.equal(retriedConfig.headers.Authtoken, "FRESH_TEST_TOKEN");

  const repeatedError = {
    response: { status: 401 },
    config: {
      url: "https://jfsgw.jtcargo.co.id/test",
      headers: { authtoken: "FRESH_TEST_TOKEN" },
      __jfsAuthRetried: true
    }
  };
  await assert.rejects(
    rejectInterceptor(repeatedError),
    error => error === repeatedError
  );
});

test("performJfsLogin polls device verification on appCode 143045003 and retries upon approval", async () => {
  const { performJfsLogin, JFS_LOGIN_URL, JFS_DEVICE_QUERY_URL } = require("../src/auth/jfs-auth-manager");

  const calls = [];
  let pollAttempts = 0;

  const requestFn = async options => {
    calls.push(options);
    if (options.url === JFS_LOGIN_URL) {
      if (calls.filter(c => c.url === JFS_LOGIN_URL).length === 1) {
        return {
          data: {
            code: 143045003,
            msg: "Silakan verifikasi perangkat",
            data: { staffNo: "STAFF123" }
          }
        };
      }
      return {
        data: {
          code: 1,
          data: {
            token: "VERIFIED_DEVICE_TOKEN",
            networkCode: "NET001",
            name: "VERIFIED USER"
          }
        }
      };
    }
    if (options.url === JFS_DEVICE_QUERY_URL) {
      pollAttempts += 1;
      assert.equal(options.body.staffNo, "STAFF123");
      assert.equal(options.body.deviceNo, "TEST_DEVICE_123");
      // Return status 1 (PENDING) on 1st attempt, status 2 (APPROVED) on 2nd attempt
      return {
        data: {
          code: 0,
          data: { status: pollAttempts === 1 ? 1 : 2 }
        }
      };
    }
  };

  const result = await performJfsLogin({
    account: "STAFF123",
    password: "TEST_PASSWORD",
    deviceNo: "TEST_DEVICE_123",
    requestFn
  });

  assert.equal(result.token, "VERIFIED_DEVICE_TOKEN");
  assert.equal(result.networkCode, "NET001");
  assert.equal(pollAttempts, 2);
});
