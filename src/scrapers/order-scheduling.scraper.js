"use strict";

const FormData = require("form-data");
const { externalRequest } = require("../utils/request");

const LIST_URL = "https://jfsgw.jtcargo.co.id/customerplatform/omsOrderDispatch/page";
const DETAIL_URL = "https://jfsgw.jtcargo.co.id/customerplatform/omsOrder/detailDispatchByLog";

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

const text = value => value == null ? "" : String(value).trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function mapListOrder(item = {}) {
  return {
    orderId: text(item.id),
    waybillId: text(item.waybillId),
    customerId: text(item.customerCode || item.customerId),
    senderNameMasked: text(item.senderName || item.customerName),
    senderPhoneMasked: text(item.senderMobilePhone),
    pickupAddressMasked: text(item.senderDetailedAddress),
    sourcePlatform: text(item.orderSourceName),
    goodsName: text(item.goodsName),
    weight: number(item.packageTotalWeight),
    status: text(item.orderStatusName),
    outletCode: text(item.pickNetworkCode || item.proxyAreaCode),
    networkCode: text(item.pickNetworkCode),
    businessDate: text(item.inputTime).slice(0, 10),
    inputTime: text(item.inputTime),
    updatedTime: text(item.updateTime || item.inputTime)
  };
}

function mapOrderDetail(item = {}) {
  return {
    customerName: text(item.senderName || item.customerName),
    customerPhone: text(item.senderMobilePhone),
    pickupAddress: text(item.senderDetailedAddress),
    outletCode: text(item.pickNetworkCode || item.proxyAreaCode),
    goodsName: text(item.goodsName)
  };
}

async function scrapeOrderList({ startTime, endTime, authToken, requestFn = externalRequest }) {
  const data = [];
  for (let current = 1; ; current += 1) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      current: String(current), size: "100", startInputTime: startTime,
      endInputTime: endTime, timeType: "1",
      orderStatusCode: "106,100,101,102,105", sendCode: "01",
      startPickTime: "", endPickTime: ""
    })) form.append(key, value);
    const response = await requestFn({
      method: "POST", url: LIST_URL, body: form,
      headers: headers(authToken, form.getHeaders()),
      timeoutMs: 30000, retries: 1
    });
    const records = response?.data?.data?.records;
    if (!Array.isArray(records)) throw new Error("INVALID_ORDER_LIST_RESPONSE");
    data.push(...records.map(mapListOrder));
    if (records.length < 100) break;
  }
  return data;
}

async function scrapeOrderDetail({ orderId, authToken, requestFn = externalRequest }) {
  const response = await requestFn({
    method: "GET", url: DETAIL_URL, params: { id: orderId },
    headers: headers(authToken), timeoutMs: 15000, retries: 1
  });
  return mapOrderDetail(response?.data?.data || {});
}

module.exports = {
  DETAIL_URL, LIST_URL, mapListOrder, mapOrderDetail,
  scrapeOrderDetail, scrapeOrderList
};
