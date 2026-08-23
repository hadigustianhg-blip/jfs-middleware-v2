"use strict";

const { externalRequest } = require("../utils/request");

const SENDER_DETAIL_URL =
  "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/detailSecret";

function buildSenderDetailHeaders(authToken) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=utf-8",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "sendWaybillSite",
    "User-Agent": "Mozilla/5.0"
  };
}

function buildSenderDetailParams(waybillNo) {
  return new URLSearchParams({
    type: "senderMobilePhone",
    waybillNo,
    pageType: "1"
  });
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim() || null;
}

function normalizeSenderPhone(value) {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${hasLeadingPlus ? "+" : ""}${digits}` : null;
}

function mapSenderDetail(item) {
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    Object.keys(item).length === 0
  ) {
    return null;
  }
  return {
    senderName: normalizeText(item.senderName),
    senderMobilePhone: normalizeSenderPhone(item.senderMobilePhone),
    senderCityName: normalizeText(item.senderCityName)
  };
}

async function scrapeSenderDetail({
  waybillNo,
  authToken,
  requestFn = externalRequest
}) {
  const response = await requestFn({
    method: "GET",
    url: SENDER_DETAIL_URL,
    params: buildSenderDetailParams(waybillNo),
    headers: buildSenderDetailHeaders(authToken)
  });

  return {
    data: mapSenderDetail(response?.data?.data),
    upstreamStatus: response?.status
  };
}

module.exports = {
  SENDER_DETAIL_URL,
  buildSenderDetailHeaders,
  buildSenderDetailParams,
  mapSenderDetail,
  normalizeSenderPhone,
  normalizeText,
  scrapeSenderDetail
};
