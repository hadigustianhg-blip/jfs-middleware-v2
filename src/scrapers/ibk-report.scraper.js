"use strict";

const { externalRequest } = require("../utils/request");
const { fetchAllPages } = require("../utils/pagination");

const IBK_REPORT_URL =
  "https://jfsgw.jtcargo.co.id/financialmanagement/ibkFundRecord/report";
const IBK_ROUTE_NAME = "advancePaymentQuery";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

function buildIbkHeaders(authToken) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: IBK_ROUTE_NAME,
    "User-Agent": "Mozilla/5.0"
  };
}

const { getOutletConfig } = require("../config/jfs-outlet-config");

function buildIbkPayload({
  current,
  size,
  startTime,
  endTime,
  financialCenterId = getOutletConfig().financeId
}) {
  return {
    current,
    size,
    financialCenterId,
    networkId: 2015,
    timeType: 1,
    searchType: 1,
    countryId: "1",
    recordStartTime: startTime,
    recordEndTime: endTime
  };
}

function getRecords(responseData) {
  const records = responseData?.data?.records;
  if (!Array.isArray(records)) {
    const error = new Error("Respons pagination JFS tidak valid");
    error.code = "INVALID_PAGINATION";
    throw error;
  }
  return records;
}

function hasMorePages(responseData, records, page) {
  const container = responseData?.data || {};
  const totalPages = Number(
    container.pages ?? container.totalPage ?? container.totalPages
  );
  if (Number.isFinite(totalPages) && totalPages >= 0) {
    return page < totalPages;
  }

  const totalRecords = Number(container.total);
  if (Number.isFinite(totalRecords) && totalRecords >= 0) {
    return page * PAGE_SIZE < totalRecords;
  }

  return records.length === PAGE_SIZE;
}

function transactionKey(item = {}) {
  const sourceId =
    item.id ??
    item.recordId ??
    item.transactionId ??
    item.tradeNo ??
    item.serialNo ??
    item.referenceNo;
  if (sourceId !== undefined && sourceId !== null && sourceId !== "") {
    return `id:${sourceId}`;
  }

  return [
    item.networkName,
    item.tradeType,
    item.feeTypeName,
    item.feeItemTypeName,
    item.date,
    item.amount
  ].map(value => value ?? "").join("|");
}

function mapIbkRecord(item = {}) {
  return {
    networkName: item.networkName || "",
    tradeType: item.tradeType || 0,
    feeTypeName: item.feeTypeName || "",
    feeItemTypeName: item.feeItemTypeName || "",
    date: item.date || "",
    amount: item.amount || 0
  };
}

async function scrapeIbkReport({
  startTime,
  endTime,
  authToken,
  requestFn = externalRequest,
  maxPages = MAX_PAGES
}) {
  const result = await fetchAllPages({
    pageSize: PAGE_SIZE,
    maxPages,
    async fetchPage({ page, pageSize }) {
      const response = await requestFn({
        method: "POST",
        url: IBK_REPORT_URL,
        params: { current: page, size: pageSize },
        body: buildIbkPayload({
          current: page,
          size: pageSize,
          startTime,
          endTime
        }),
        headers: buildIbkHeaders(authToken)
      });
      const responseData = response?.data;
      const records = getRecords(responseData);

      return {
        responseData,
        items: records,
        pageKey: records.length
          ? `${records.length}:${transactionKey(records[0])}:${transactionKey(records.at(-1))}`
          : "empty"
      };
    },
    getItems: pageResult => pageResult.items,
    hasMore: (pageResult, records, page) =>
      hasMorePages(pageResult.responseData, records, page)
  });

  const unique = new Map();
  for (const item of result.items) {
    const transactionDate = String(item?.date || "").slice(0, 10);
    if (
      transactionDate &&
      (transactionDate < startTime.slice(0, 10) ||
        transactionDate > endTime.slice(0, 10))
    ) {
      continue;
    }
    const key = transactionKey(item);
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  return {
    data: [...unique.values()].map(mapIbkRecord),
    pageCount: result.pageCount,
    stoppedReason: result.stoppedReason
  };
}

module.exports = {
  IBK_REPORT_URL,
  IBK_ROUTE_NAME,
  MAX_PAGES,
  PAGE_SIZE,
  buildIbkHeaders,
  buildIbkPayload,
  mapIbkRecord,
  scrapeIbkReport,
  transactionKey
};
