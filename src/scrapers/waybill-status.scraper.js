"use strict";

const { externalRequest } = require("../utils/request");
const { fetchAllPages } = require("../utils/pagination");

const WAYBILL_STATUS_URL =
  "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination?sqlCode=waybill_order_status_query";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

function buildWaybillStatusPayload({
  waybills,
  startDate,
  endDate,
  current,
  size = PAGE_SIZE
}) {
  return {
    current,
    size,
    startDate: `${startDate} 00:00:00`,
    endDate: `${endDate} 23:59:59`,
    scanSiteCode: "SUM001A",
    scanType: "收件",
    billType: 0,
    billNoList: waybills,
    signType: "3",
    convertResultFromDictionCode:
      "isVoid|106,scanType|266,currentScantType|266",
    countryId: "1"
  };
}

function buildWaybillStatusHeaders(authToken) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "waybillStatusConstantlyNew|businessIndicatorIndex",
    "User-Agent": "Mozilla/5.0"
  };
}

function mapWaybillStatusRecord(item = {}) {
  return {
    billCode: item.billCode ?? "",
    saleMan: item.saleMan ?? "",
    currentScanSite: item.currentScanSite ?? "",
    scanUser: item.scanUser ?? "",
    estimateTime: item.estimateTime ?? "",
    currentScanTime: item.currentScantTime ?? "",
    scanTime: item.scanTime ?? "",
    orderSourceName: item.orderSourceName ?? "",
    inputTime: item.inputTime ?? "",
    scanSiteCode: item.scanSiteCode ?? "",
    scanSite: item.scanSite ?? "",
    recordId: item.recordid ?? "",
    stayReason: item.stayReason ?? "",
    isVoid: item.isVoid ?? "",
    receiverCityName: item.receiverCityName ?? "",
    currentScanType: item.currentScantType ?? "",
    scanType: item.scanType ?? "",
    estimateTimeStandard: item.estimateTimeStandard ?? "",
    problemReason: item.problemReason ?? ""
  };
}

async function scrapeWaybillStatus({
  waybills,
  startDate,
  endDate,
  authToken,
  requestFn = externalRequest
}) {
  const result = await fetchAllPages({
    pageSize: PAGE_SIZE,
    maxPages: MAX_PAGES,
    async fetchPage({ page, pageSize }) {
      const response = await requestFn({
        method: "POST",
        url: WAYBILL_STATUS_URL,
        body: buildWaybillStatusPayload({
          waybills,
          startDate,
          endDate,
          current: page,
          size: pageSize
        }),
        headers: buildWaybillStatusHeaders(authToken)
      });

      return {
        items: response?.data?.data?.records || [],
        pageKey: page
      };
    }
  });

  return {
    data: result.items.map(mapWaybillStatusRecord),
    pageCount: result.pageCount,
    stoppedReason: result.stoppedReason
  };
}

module.exports = {
  MAX_PAGES,
  PAGE_SIZE,
  WAYBILL_STATUS_URL,
  buildWaybillStatusHeaders,
  buildWaybillStatusPayload,
  mapWaybillStatusRecord,
  scrapeWaybillStatus
};
