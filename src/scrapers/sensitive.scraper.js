"use strict";

const axios = require("axios");

const SENSITIVE_DETAIL_URL =
  "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/sensitiveDetailByWaybillNo";

function buildSensitiveHeaders(authToken) {
  return {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    "Authtoken": authToken,
    "Lang": "ID",
    "Langtype": "ID",
    "Origin": "https://jfs.jtcargo.co.id",
    "Referer": "https://jfs.jtcargo.co.id/",
    "Routename": "dispatchWaybill",
    "User-Agent": "Mozilla/5.0"
  };
}

function mapSensitiveDetail(item = {}) {
  return {
    waybillNo: item.waybillNo || "",
    dispatchTime: item.dispatchTime || "",
    dispatchStaffName: item.dispatchStaffName || "",
    receiverName: item.receiverName || "",
    receiverMobilePhone: item.receiverMobilePhone || "",
    receiverTelphone: item.receiverTelphone || "",
    receiverDetailedAddress: item.receiverDetailedAddress || "",
    chargeWeight: item.chargeWeight || 0,
    abnormalName: item.abnormalName || "",
    updateTime: item.updateTime || "",
    codMoney: item.codMoney || 0,
    goodsName: item.goodsName || ""
  };
}

async function scrapeSensitiveDetail({
  waybillNo,
  authToken,
  requestFn = axios
}) {
  const response = await requestFn({
    method: "POST",
    url: SENSITIVE_DETAIL_URL,
    params: {
      waybillNo,
      chanel: 2
    },
    headers: buildSensitiveHeaders(authToken),
    data: {
      countryId: "1"
    }
  });

  return {
    data: mapSensitiveDetail(response?.data?.data || {})
  };
}

module.exports = {
  SENSITIVE_DETAIL_URL,
  buildSensitiveHeaders,
  mapSensitiveDetail,
  scrapeSensitiveDetail
};
