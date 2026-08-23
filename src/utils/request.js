"use strict";

const axios = require("axios");
const {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS
} = require("../config/constants");
const logger = require("./logger");

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ETIMEDOUT"
]);

class ExternalRequestError extends Error {
  constructor(message, metadata = {}, options = {}) {
    super(message, options);
    this.name = "ExternalRequestError";
    Object.assign(this, metadata);
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function parseJsonBody(data, status) {
  if (data !== null && typeof data === "object") {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch (cause) {
    throw new ExternalRequestError(
      "Upstream response is not valid JSON",
      {
        code: "INVALID_JSON",
        status,
        isTimeout: false,
        isUpstream: true
      },
      { cause }
    );
  }
}

function createHttpError(status, data) {
  const unauthorized = status === 401 || status === 403;
  const error = new ExternalRequestError(
    unauthorized ? "Upstream authorization failed" : "Upstream HTTP request failed",
    {
      code: unauthorized ? "UNAUTHORIZED" : "UPSTREAM_HTTP_ERROR",
      status,
      isTimeout: false,
      isUpstream: true
    }
  );

  // Kept for compatibility with existing endpoint catch blocks.
  error.response = { status, data };
  return error;
}

function isJfsApplicationUnauthorized(response) {
  const code = response?.data?.code;
  return code !== null && code !== undefined && String(code).trim() === "401";
}

function assertJfsApplicationAuthorized(response) {
  if (!isJfsApplicationUnauthorized(response)) return response;

  const error = new ExternalRequestError(
    "Upstream application authorization failed",
    {
      code: "UNAUTHORIZED",
      status: 401,
      isTimeout: false,
      isUpstream: true,
      applicationCode: 401
    }
  );
  error.response = { status: response?.status, data: response?.data };
  throw error;
}

function createNetworkError(cause) {
  const isTimeout =
    cause.code === "ECONNABORTED" ||
    cause.code === "ETIMEDOUT" ||
    /timeout/i.test(cause.message || "");

  return new ExternalRequestError(
    isTimeout ? "Upstream request timed out" : "Upstream network request failed",
    {
      code: isTimeout ? "UPSTREAM_TIMEOUT" : "NETWORK_ERROR",
      status: undefined,
      isTimeout,
      isUpstream: true,
      networkCode: cause.code
    },
    { cause }
  );
}

function shouldRetry(error) {
  return (
    RETRYABLE_STATUSES.has(error.status) ||
    error.isTimeout ||
    RETRYABLE_NETWORK_CODES.has(error.networkCode)
  );
}

async function externalRequest({
  url,
  method = "GET",
  headers = {},
  body,
  params,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  retries = DEFAULT_RETRY_COUNT,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
}) {
  if (!url) {
    throw new TypeError("url is required");
  }

  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError("retries must be a non-negative integer");
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await axios({
        url,
        method,
        headers,
        params,
        data: body,
        timeout: timeoutMs,
        responseType: "text",
        transformResponse: [data => data],
        validateStatus: () => true
      });

      const data = parseJsonBody(response.data, response.status);

      if (response.status < 200 || response.status >= 300) {
        throw createHttpError(response.status, data);
      }

      return assertJfsApplicationAuthorized({
        data,
        status: response.status,
        headers: response.headers
      });
    } catch (cause) {
      const error =
        cause instanceof ExternalRequestError
          ? cause
          : createNetworkError(cause);
      const canRetry = attempt < retries && shouldRetry(error);

      logger[canRetry ? "warn" : "error"]("External request failed", {
        method,
        host: new URL(url).host,
        attempt: attempt + 1,
        status: error.status,
        code: error.code,
        authorization: headers.authorization,
        token: headers.authtoken,
        cookie: headers.cookie
      });

      if (!canRetry) {
        throw error;
      }

      await delay(retryDelayMs);
    }
  }

  throw new ExternalRequestError("External request failed", {
    code: "UNKNOWN_REQUEST_ERROR",
    isUpstream: true
  });
}

module.exports = {
  ExternalRequestError,
  assertJfsApplicationAuthorized,
  externalRequest,
  isJfsApplicationUnauthorized,
  shouldRetry
};
