"use strict";

const FormData = require("form-data");
const { createHash } = require("node:crypto");
const { externalRequest } = require("../utils/request");

const LIST_URL = "https://jfsgw.jtcargo.co.id/customerplatform/omsOrderDispatch/page";
const DETAIL_URL = "https://jfsgw.jtcargo.co.id/customerplatform/omsOrder/detailDispatchByLog";
const DEFAULT_STATUS_CODES = "100,106,101,102,105";
const MAX_PAGES = 500;

function headers(authToken, contentType = {}) {
  return {
    ...contentType,
    Accept: "application/json, text/plain, */*",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "orderScheduling",
    "User-Agent": "Mozilla/5.0"
  };
}

function requiredText(value, code) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw Object.assign(new Error(code), { code });
  return result;
}

function parseStatusCodes(value = DEFAULT_STATUS_CODES) {
  const source = Array.isArray(value) ? value : String(value).split(",");
  const codes = source.map(item => String(item).trim()).filter(Boolean);
  if (!codes.length || codes.some(code => !/^\d{1,10}$/.test(code))) {
    throw Object.assign(new Error("INVALID_ORDER_STATUS_CODE"), { code: "INVALID_ORDER_STATUS_CODE" });
  }
  return codes.join(",");
}

function validateListInput(input = {}) {
  const pageSize = input.pageSize === undefined ? 100 : Number(input.pageSize);
  const timeType = input.timeType === undefined ? 1 : Number(input.timeType);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw Object.assign(new Error("INVALID_PAGE_SIZE"), { code: "INVALID_PAGE_SIZE" });
  }
  if (timeType !== 1) {
    throw Object.assign(new Error("INVALID_TIME_TYPE"), { code: "INVALID_TIME_TYPE" });
  }
  return {
    startInputTime: requiredText(input.startInputTime, "START_INPUT_TIME_REQUIRED"),
    endInputTime: requiredText(input.endInputTime, "END_INPUT_TIME_REQUIRED"),
    timeType,
    orderStatusCode: parseStatusCodes(input.orderStatusCode),
    startPickTime: typeof input.startPickTime === "string" ? input.startPickTime.trim() : "",
    endPickTime: typeof input.endPickTime === "string" ? input.endPickTime.trim() : "",
    pageSize
  };
}

function validateExternalJfsId(value) {
  const id = requiredText(value, "EXTERNAL_JFS_ID_REQUIRED");
  if (!/^\d{1,64}$/.test(id)) {
    throw Object.assign(new Error("INVALID_EXTERNAL_JFS_ID"), { code: "INVALID_EXTERNAL_JFS_ID" });
  }
  return id;
}

function pageFingerprint(records) {
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

async function scrapeOmsSchedulingList(input, authToken, requestFn = externalRequest) {
  const validated = validateListInput(input);
  const records = [];
  const fingerprints = new Set();
  let reportedTotal = null;

  for (let current = 1; current <= MAX_PAGES; current += 1) {
    const form = new FormData();
    const payload = {
      current: String(current),
      size: String(validated.pageSize),
      startInputTime: validated.startInputTime,
      endInputTime: validated.endInputTime,
      timeType: String(validated.timeType),
      orderStatusCode: validated.orderStatusCode,
      startPickTime: validated.startPickTime,
      endPickTime: validated.endPickTime
    };
    for (const [key, value] of Object.entries(payload)) form.append(key, value);

    const response = await requestFn({
      method: "POST",
      url: LIST_URL,
      body: form,
      headers: headers(authToken, form.getHeaders()),
      timeoutMs: 30000,
      retries: 1
    });
    const page = response?.data?.data;
    if (!page || !Array.isArray(page.records)) {
      throw Object.assign(new Error("INVALID_OMS_SCHEDULING_LIST_RESPONSE"), { code: "INVALID_OMS_SCHEDULING_LIST_RESPONSE" });
    }
    const pageRecords = page.records;
    if (!pageRecords.length) {
      return { records, total: reportedTotal ?? records.length, pagesFetched: current };
    }
    const fingerprint = pageFingerprint(pageRecords);
    if (fingerprints.has(fingerprint)) {
      throw Object.assign(new Error("OMS_SCHEDULING_REPEATED_PAGE"), { code: "OMS_SCHEDULING_REPEATED_PAGE" });
    }
    fingerprints.add(fingerprint);
    records.push(...pageRecords);

    const total = Number(page.total);
    if (Number.isFinite(total) && total >= 0) reportedTotal = total;
    const pages = Number(page.pages);
    if ((reportedTotal !== null && records.length >= reportedTotal) ||
        (Number.isFinite(pages) && pages >= 0 && current >= pages) ||
        pageRecords.length < validated.pageSize) {
      return { records, total: reportedTotal ?? records.length, pagesFetched: current };
    }
  }
  throw Object.assign(new Error("OMS_SCHEDULING_MAX_PAGES_EXCEEDED"), { code: "OMS_SCHEDULING_MAX_PAGES_EXCEEDED" });
}

async function scrapeOmsSchedulingDetail(input, authToken, requestFn = externalRequest) {
  const externalJfsId = validateExternalJfsId(input?.externalJfsId);
  const response = await requestFn({
    method: "GET",
    url: DETAIL_URL,
    params: { id: externalJfsId },
    headers: headers(authToken),
    timeoutMs: 15000,
    retries: 1
  });
  const data = response?.data?.data;
  if (!data || typeof data !== "object") {
    throw Object.assign(new Error("INVALID_OMS_SCHEDULING_DETAIL_RESPONSE"), { code: "INVALID_OMS_SCHEDULING_DETAIL_RESPONSE" });
  }
  return data;
}

module.exports = {
  DEFAULT_STATUS_CODES,
  DETAIL_URL,
  LIST_URL,
  MAX_PAGES,
  parseStatusCodes,
  scrapeOmsSchedulingDetail,
  scrapeOmsSchedulingList,
  validateExternalJfsId,
  validateListInput
};
