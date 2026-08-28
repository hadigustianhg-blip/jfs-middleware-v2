"use strict";

const { externalRequest } = require("../utils/request");

const AGING_SIGN_URL =
  "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination?sqlCode=realtime_bus_aging_sign_sum_nd&dcr_key=57b048fb-bc8c-4d24-982b-a750b7ce8693";

function buildAgingSignPayload(date) {
  return {
    timeType: "sign",
    beginDate: date,
    endDate: date,
    netType: "2",
    businessModelId: "0",
    paginationSearchType: "list",
    current: 1,
    size: 20,
    countryId: "1",
    dispatchCode: "",
    isReceivePay: "",
    isRefund: "",
    sqlCode: "realtime_bus_aging_sign_sum_nd"
  };
}

function buildAgingSignHeaders(authToken) {
  return {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    "Authtoken": authToken,
    "Lang": "ID",
    "Langtype": "ID",
    "Origin": "https://jfs.jtcargo.co.id",
    "Referer": "https://jfs.jtcargo.co.id/",
    "Routename": "Bd-theme-42cb1bb7-3560-47e0-923a-f87ea5f7b1fe",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"
  };
}

function mapAgingSignRecord(item) {
  return {
    signTimelyTotal: item.signTimelyTotal || 0,
    networkName: item.networkName || "",
    signDelayOtherTotal: item.signDelayOtherTotal || 0,
    signTimelyRate: item.signTimelyRate || "0%",
    problemOtherTotal: item.problemOtherTotal || 0,
    queryTime: item.queryTime || "",
    sendCenterTotal: item.sendCenterTotal || 0,
    signDelayNoSignTotal: item.signDelayNoSignTotal || 0
  };
}

async function scrapeAgingSign({
  date,
  authToken,
  requestFn = externalRequest
}) {
  const response = await requestFn({
    method: "POST",
    url: AGING_SIGN_URL,
    body: buildAgingSignPayload(date),
    headers: buildAgingSignHeaders(authToken)
  });
  const records = response?.data?.data?.records || [];

  return {
    data: records.map(mapAgingSignRecord)
  };
}

module.exports = {
  AGING_SIGN_URL,
  buildAgingSignHeaders,
  buildAgingSignPayload,
  mapAgingSignRecord,
  scrapeAgingSign
};
