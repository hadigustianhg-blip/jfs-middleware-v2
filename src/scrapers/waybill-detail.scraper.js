"use strict";

const { externalRequest } = require("../utils/request");

const WAYBILL_DETAIL_URL =
  "https://jfsgw.jtcargo.co.id/operatingplatform/order/getOrderDetail";
const WAYBILL_PATTERN = /^[A-Za-z0-9]{1,100}$/;

function createWaybillDetailError(code, message) {
  return Object.assign(new Error(message), { code });
}

function normalizeWaybillNo(value) {
  if (typeof value !== "string" || !WAYBILL_PATTERN.test(value.trim())) {
    throw createWaybillDetailError("INVALID_WAYBILL_NO", "waybillNo is invalid");
  }
  return value.trim();
}

function buildWaybillDetailPayload(waybillNo) {
  return { waybillNo: normalizeWaybillNo(waybillNo), countryId: "1" };
}

function buildWaybillDetailHeaders(authToken) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "trackingExpress",
    "User-Agent": "Mozilla/5.0"
  };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function maskedPhone(value) {
  const phone = text(value);
  if (!phone || !/[xX*•]/.test(phone) || /\d{7,}/.test(phone)) return "";
  return phone;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeWaybillDetailResponse(responseData, requestedWaybillNo) {
  if (!responseData || responseData.code !== 1 || responseData.succ !== true || responseData.fail !== false) {
    throw createWaybillDetailError("JFS_WAYBILL_DETAIL_UPSTREAM_FAILED", "JFS waybill detail request failed");
  }
  const waybillNo = normalizeWaybillNo(requestedWaybillNo);
  const data = responseData.data;
  if (!data || typeof data !== "object" || text(data.waybillNo) !== waybillNo) {
    throw createWaybillDetailError("WAYBILL_DETAIL_NOT_FOUND", "Waybill detail was not found");
  }
  return {
    waybillNo,
    customerName: text(data.customerName),
    sender: { name: text(data.senderName), city: text(data.senderCityName) },
    receiver: {
      name: text(data.receiverName),
      mobileMasked: maskedPhone(data.receiverMobilePhone),
      address: text(data.receiverDetailedAddress)
    },
    goods: { name: text(data.goodsName), packageNumber: number(data.packageNumber) },
    codMoney: number(data.codMoney)
  };
}

async function scrapeWaybillDetail({ waybillNo, authToken, requestFn = externalRequest }) {
  const normalizedWaybillNo = normalizeWaybillNo(waybillNo);
  const response = await requestFn({
    method: "POST",
    url: WAYBILL_DETAIL_URL,
    headers: buildWaybillDetailHeaders(authToken),
    body: buildWaybillDetailPayload(normalizedWaybillNo)
  });
  return normalizeWaybillDetailResponse(response?.data, normalizedWaybillNo);
}

module.exports = {
  WAYBILL_DETAIL_URL,
  buildWaybillDetailHeaders,
  buildWaybillDetailPayload,
  normalizeWaybillDetailResponse,
  scrapeWaybillDetail
};
