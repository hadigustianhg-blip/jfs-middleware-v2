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
    queryFlag: "2",
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
    billCode: item.billcode ?? item.billCode ?? "",
    customerName: item.name ?? item.customerName ?? "",
    customerCode: item.customer_code ?? item.customerCode ?? "",
    goodsName: item.goods_name ?? item.goodsName ?? "",
    packageNumber: Number(item.package_number || item.packageNumber || 0),
    weight: Number(item.weight || 0),
    volume: Number(item.volume || 0),
    inventoryHours: Number(item.inventoryHours || 0),
    transitHours: Number(item.transitHours || 0),
    codNeed: item.cod_need ?? item.codNeed ?? "",
    isReceiverPay: item.is_receiver_pay ?? item.isReceiverPay ?? "",
    isRefund: item.is_refund ?? item.isRefund ?? "",
    isProblemPiece: item.isProblemPiece ?? "",
    waybillStatus: item.waybill_status ?? item.waybillStatus ?? "",
    operateSiteType: item.operate_site_type ?? item.operateSiteType ?? "",
    operateSiteName: item.operate_site_name ?? item.operateSiteName ?? "",
    destinationSiteName:
      item.destination_site_name ?? item.destinationSiteName ?? "",
    sendNextStation: item.SEND_NEXTSTATION ?? item.sendNextStation ?? "",
    problemCategory:
      item.proble_type_subject_name ?? item.problemCategory ?? "",
    problemType: item.second_level_type_name ?? item.problemType ?? "",
    abnormalRemark: item.abnormal_remark ?? item.abnormalRemark ?? "",
    takeScanTime: item.take_scantime ?? item.takeScanTime ?? "",
    operateScanTime1:
      item.operate_scantime_1 ?? item.operateScanTime1 ??
      item.operateScanTime ?? "",
    operateScanTime2:
      item.operate_scantime_2 ?? item.operateScanTime2 ?? "",
    abnormalRegisterTime:
      item.abnormal_reg_time ?? item.abnormalRegisterTime ?? "",
    proxyAreaName: item.proxy_area_name ?? item.proxyAreaName ?? "",
    takeProxyAreaName:
      item.take_proxy_area_name ?? item.takeProxyAreaName ?? "",
    destinationProxyAreaName:
      item.dest_proxy_area_name ?? item.destinationProxyAreaName ?? "",
    takeSiteName: item.take_site_name ?? item.takeSiteName ?? "",
    firstDistributionName:
      item.first_distribution_name ?? item.firstDistributionName ?? "",
    destinationDistributionName:
      item.destination_distribution_name ??
      item.destinationDistributionName ?? "",
    expressTypeName: item.express_type_name ?? item.expressTypeName ?? "",
    deliverCount: Number(item.deliver_count || item.deliverCount || 0),
    dispatchName: item.dispatch_name ?? item.dispatchName ?? "",
    shipHour: item.ship_hour ?? item.shipHour ?? ""
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
