"use strict";

const { externalRequest } = require("../utils/request");
const { fetchAllPages } = require("../utils/pagination");

const INVENTORY_DETAIL_URL =
  "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination?sqlCode=realtime_inv_man_dtl&dcr_key=57b048fb-bc8c-4d24-982b-a750b7ce8693";
const INVENTORY_DETAIL_SQL_CODE = "realtime_inv_man_dtl";
const INVENTORY_DETAIL_ROUTE_NAME =
  "Bd-theme-4d718ae8-fa85-4edc-b98c-1a0f75e5f9f3|businessIndicatorIndex";
const PAGE_DELAY_MS = 300;

function buildInventoryDetailPayload({
  startDate,
  endDate,
  billCode = "",
  current,
  size
}) {
  return {
    billCode,
    isOverDate: "",
    queryFlag: "all",
    beginDate: `${startDate} 00:00:00`,
    endDate: `${endDate} 23:59:59`,
    operateSiteType: "all",
    expressTypeCode: "",
    codNeed: "",
    invOverTm: "",
    shipHour: "",
    customerCode: "",
    isRefund: "",
    sqlCode: INVENTORY_DETAIL_SQL_CODE,
    current,
    size,
    convertResultFromDictionCode:
      "is_receiver_pay|124,isProblemPiece|124,cod_need|124,is_refund|124",
    convertResultFromDictionOriCode: "",
    paginationSearchType: "list",
    countryId: "1"
  };
}

function buildInventoryDetailHeaders(authToken) {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "id,en-US;q=0.9,en;q=0.8",
    "Cache-Control": "max-age=2, must-revalidate",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: INVENTORY_DETAIL_ROUTE_NAME,
    "User-Agent": "Mozilla/5.0"
  };
}

function mapInventoryDetailRecord(item = {}) {
  return {
    billCode: item.billCode ?? "",
    customerName: item.customerName ?? "",
    goodsName: item.goodsName ?? "",
    packageNumber: item.packageNumber ?? 0,
    weight: item.weight ?? 0,
    inventoryHours: item.inventoryHours ?? 0,
    codNeed: item.codNeed ?? 0,
    waybillStatus: item.waybillStatus ?? "",
    operateSiteType: item.operateSiteType ?? "",
    operateSiteName: item.operateSiteName ?? "",
    destinationSiteName: item.destinationSiteName ?? "",
    sendNextStation: item.sendNextStation ?? "",
    problemCategory: item.problemCategory ?? "",
    problemType: item.problemType ?? "",
    abnormalRemark: item.abnormalRemark ?? "",
    takeScanTime: item.takeScanTime ?? "",
    operateScanTime: item.operateScanTime ?? "",
    abnormalRegisterTime: item.abnormalRegisterTime ?? ""
  };
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function scrapeInventoryDetail({
  startDate,
  endDate,
  billCode = "",
  size = 100,
  maxPage = 100,
  authToken,
  requestFn = externalRequest,
  delayFn = wait
}) {
  const result = await fetchAllPages({
    pageSize: size,
    maxPages: maxPage,
    async fetchPage({ page, pageSize }) {
      if (page > 1) {
        await delayFn(PAGE_DELAY_MS);
      }

      const response = await requestFn({
        method: "POST",
        url: INVENTORY_DETAIL_URL,
        body: buildInventoryDetailPayload({
          startDate,
          endDate,
          billCode,
          current: page,
          size: pageSize
        }),
        headers: buildInventoryDetailHeaders(authToken)
      });

      return {
        items: response?.data?.data?.records || [],
        pageKey: page
      };
    }
  });

  return {
    data: result.items.map(mapInventoryDetailRecord),
    pageCount: result.pageCount,
    stoppedReason: result.stoppedReason
  };
}

module.exports = {
  INVENTORY_DETAIL_SQL_CODE,
  INVENTORY_DETAIL_ROUTE_NAME,
  INVENTORY_DETAIL_URL,
  PAGE_DELAY_MS,
  buildInventoryDetailHeaders,
  buildInventoryDetailPayload,
  mapInventoryDetailRecord,
  scrapeInventoryDetail
};
