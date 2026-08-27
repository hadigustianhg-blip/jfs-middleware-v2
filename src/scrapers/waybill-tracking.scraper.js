"use strict";

const { externalRequest } = require("../utils/request");

const WAYBILL_TRACKING_URL =
  "https://jfsgw.jtcargo.co.id/operatingplatform/podTracking/inner/query/keywordList";
const WAYBILL_PATTERN = /^[A-Za-z0-9]{1,100}$/;

function createTrackingError(code, message) {
  return Object.assign(new Error(message), { code });
}

function normalizeWaybillNo(value) {
  if (typeof value !== "string") {
    throw createTrackingError("INVALID_WAYBILL_NO", "waybillNo must be a string");
  }
  const waybillNo = value.trim();
  if (!WAYBILL_PATTERN.test(waybillNo)) {
    throw createTrackingError("INVALID_WAYBILL_NO", "waybillNo is invalid");
  }
  return waybillNo;
}

function buildWaybillTrackingPayload(waybillNo) {
  return {
    keywordList: [normalizeWaybillNo(waybillNo)],
    trackingTypeEnum: "WAYBILL",
    countryId: "1"
  };
}

function buildWaybillTrackingHeaders(authToken) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "waybillTracking",
    "User-Agent": "Mozilla/5.0"
  };
}

function redactPhoneNumbers(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\(\s*\+?\d[\d\s-]{6,}\s*\)/g, "")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function eventSortKey(event) {
  const primary = event.scanTime || event.uploadTime || "";
  const normalized = primary.includes("T") ? primary : primary.replace(" ", "T");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareTrackingEvents(left, right) {
  const leftTime = eventSortKey(left.event);
  const rightTime = eventSortKey(right.event);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (leftTime !== null && rightTime === null) return 1;
  if (leftTime === null && rightTime !== null) return -1;
  const leftFallback = `${left.event.scanTime || ""}\u0000${left.event.uploadTime || ""}`;
  const rightFallback = `${right.event.scanTime || ""}\u0000${right.event.uploadTime || ""}`;
  return leftFallback.localeCompare(rightFallback) || left.index - right.index;
}

function normalizeTrackingEvent(item = {}) {
  return {
    scanTime: item.scanTime ?? "",
    uploadTime: item.uploadTime ?? "",
    scanTypeName: item.scanTypeName ?? "",
    scanNetworkName: item.scanNetworkName ?? "",
    scanNetworkCode: item.scanNetworkCode ?? "",
    nextStopName: item.nextStopName ?? "",
    nextNetworkCode: item.nextNetworkCode ?? "",
    status: item.status ?? "",
    code: item.code ?? null,
    scanMode: item.scanMode ?? "",
    taskCode: item.taskCode ?? "",
    description: redactPhoneNumbers(item.waybillTrackingContent)
  };
}

function normalizeWaybillTrackingResponse(responseData, requestedWaybillNo) {
  if (
    !responseData ||
    responseData.code !== 1 ||
    responseData.succ !== true ||
    responseData.fail !== false ||
    !Array.isArray(responseData.data)
  ) {
    throw createTrackingError(
      "JFS_WAYBILL_TRACKING_UPSTREAM_FAILED",
      "JFS waybill tracking request failed"
    );
  }

  const waybillNo = normalizeWaybillNo(requestedWaybillNo);
  const match = responseData.data.find(item =>
    typeof item?.keyword === "string" && item.keyword.trim() === waybillNo
  );
  if (!match || !Array.isArray(match.details) || match.details.length === 0) {
    throw createTrackingError("WAYBILL_TRACKING_NOT_FOUND", "Waybill tracking was not found");
  }

  const timeline = match.details
    .map((event, index) => ({ event: normalizeTrackingEvent(event), index }))
    .sort(compareTrackingEvents)
    .map(({ event }) => event);
  const latestEvent = timeline[timeline.length - 1];

  return {
    waybillNo,
    latest: {
      scanTime: latestEvent.scanTime,
      scanTypeName: latestEvent.scanTypeName,
      scanNetworkName: latestEvent.scanNetworkName,
      scanNetworkCode: latestEvent.scanNetworkCode,
      status: latestEvent.status,
      code: latestEvent.code,
      uploadTime: latestEvent.uploadTime,
      scanMode: latestEvent.scanMode,
      nextStopName: latestEvent.nextStopName,
      nextNetworkCode: latestEvent.nextNetworkCode,
      taskCode: latestEvent.taskCode
    },
    timeline
  };
}

async function scrapeWaybillTracking({
  waybillNo,
  authToken,
  requestFn = externalRequest
}) {
  const normalizedWaybillNo = normalizeWaybillNo(waybillNo);
  const response = await requestFn({
    method: "POST",
    url: WAYBILL_TRACKING_URL,
    headers: buildWaybillTrackingHeaders(authToken),
    body: buildWaybillTrackingPayload(normalizedWaybillNo)
  });
  return normalizeWaybillTrackingResponse(response?.data, normalizedWaybillNo);
}

module.exports = {
  WAYBILL_TRACKING_URL,
  buildWaybillTrackingHeaders,
  buildWaybillTrackingPayload,
  normalizeWaybillNo,
  normalizeWaybillTrackingResponse,
  redactPhoneNumbers,
  scrapeWaybillTracking
};
