"use strict";

const FormData = require("form-data");
const moment = require("moment-timezone");
const { scrapeInventoryDetail } = require("../scrapers/inventory-detail.scraper");
const { scrapeAgingSign } = require("../scrapers/aging-sign.scraper");
const { scrapeWaybillStatus } = require("../scrapers/waybill-status.scraper");
const { scrapeIbkReport } = require("../scrapers/ibk-report.scraper");
const { scrapeSenderDetail } = require("../scrapers/sender-detail.scraper");
const { scrapeOrderList } = require("../scrapers/order-scheduling.scraper");
const { scrapeSensitiveDetail } = require("../scrapers/sensitive.scraper");
const { scrapeWaybillTracking } = require("../scrapers/waybill-tracking.scraper");
const { scrapeWaybillDetail } = require("../scrapers/waybill-detail.scraper");
const { assertJfsApplicationAuthorized } = require("../utils/request");
const { mapRepaymentType } = require("../mappers/cod.mapper");
const {
  scrapeOmsSchedulingDetail,
  scrapeOmsSchedulingList
} = require("../scrapers/oms-scheduling.scraper");

function isScopedUnauthorized(error) {
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (
      current.code === "UNAUTHORIZED" || current.status === 401 || current.status === 403 ||
      current.response?.status === 401 || current.response?.status === 403
    ) return true;
    current = current.cause;
  }
  return false;
}

const {
  isEmergencyTokenModeActive,
  getEmergencyToken,
  EmergencyTokenError
} = require("../utils/emergency-token");

async function executeWithScopedAuth(context, operation) {
  if (isEmergencyTokenModeActive()) {
    const token = getEmergencyToken();
    try {
      return await operation(token);
    } catch (error) {
      if (isScopedUnauthorized(error)) {
        throw new EmergencyTokenError(
          "Emergency token JFS ditolak oleh server (401).",
          "JFS_EMERGENCY_TOKEN_EXPIRED",
          401
        );
      }
      throw error;
    }
  }

  let token = await context.authManager.getAuthToken();
  try {
    return await operation(token);
  } catch (error) {
    if (!isScopedUnauthorized(error)) throw error;
    context.authManager.clearToken();
    token = await context.authManager.refreshLogin();
    return operation(token);
  }
}

async function scopedAxiosPost(context, url, data, buildConfig) {
  return executeWithScopedAuth(context, async token => {
    const response = await context.axiosClient.post(url, data, buildConfig(token));
    assertJfsApplicationAuthorized({
      status: response.status,
      data: response.data,
      headers: response.headers
    });
    return response;
  });
}

function scopedRequestFn(context, requestFn) {
  const execute = requestFn || context.request;
  return async options => assertJfsApplicationAuthorized(await execute(options));
}

function assertNoRuntimeTestHooks(options) {
  for (const field of ["mockData", "fallbackToMock"]) {
    if (Object.prototype.hasOwnProperty.call(options, field)) {
      throw Object.assign(new Error(`Runtime option ${field} is forbidden`), {
        code: "FORBIDDEN_RUNTIME_OPTION", field
      });
    }
  }
}

async function executeMultiOutletScraper(context, operation, options = {}, dependencies = {}) {
  assertNoRuntimeTestHooks(options);
  const config = context.config;

  switch (operation) {
    case "PICKUP": {
      const date = options.date || options.operationalDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      try {
        let allRecords = [];
        let current = 1;
        let hasMore = true;

        while (hasMore && current <= 20) {
          const form = new FormData();
          form.append("current", current);
          form.append("size", 100);
          form.append("pickFinanceCode", config.financeCode || "BDO000");
          form.append("pickNetworkCode", config.networkCode);
          form.append("isVoid", "0");
          form.append("timeStart", `${date} 00:00:00`);
          form.append("timeEnd", `${date} 23:59:59`);
          form.append("inputTimeStart", `${date} 00:00:00`);
          form.append("inputTimeEnd", `${date} 23:59:59`);

          const response = await scopedAxiosPost(
            context,
            "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/shippingWaybillList",
            form,
            scopedToken => ({
              headers: {
                ...form.getHeaders(),
                authtoken: scopedToken,
                "Content-Type": "application/x-www-form-urlencoded",
                lang: "ID",
                langtype: "ID",
                routename: "sendWaybillSite",
                origin: "https://jfs.jtcargo.co.id",
                referer: "https://jfs.jtcargo.co.id/",
                "user-agent": "Mozilla/5.0"
              },
              timeout: 30000
            })
          );

          const records = response?.data?.data || [];
          allRecords = allRecords.concat(records);
          if (!records || records.length < 100) {
            hasMore = false;
          } else {
            current++;
          }
        }

        const clean = allRecords.map(item => ({
          waybillNo: item.waybillNo || "",
          pickNetwork: item.pickNetworkName || "",
          destination: item.destinationName || "",
          settlement: item.settlementName || "",
          totalFreight: item.totalFreight || 0,
          freight: item.freight || 0,
          weight: item.loadWeight || 0,
          staff: item.collectStaffName || item.inputStaffName || "",
          sender: item.senderName || "",
          service: item.expressTypeName || "",
          receiver: item.receiverName || "",
          address: item.receiverDetailedAddress || ""
        }));

        return { success: true, total: clean.length, data: clean };
      } catch (err) {
        throw err;
      }
    }

    case "DISPATCH": {
      const date = options.date || options.operationalDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      try {
        let allRecords = [];
        let current = 1;
        let hasMore = true;

        while (hasMore && current <= 20) {
          const payload = {
            current,
            size: 100,
            oneNetwork: config.financeCode || "BDO000",
            dispatchFinanceCode: config.financeCode || "BDO000",
            dispatchFinanceId: config.financeId || 183,
            searchTimeType: 1,
            startTime: `${date} 00:00:00`,
            endTime: `${date} 23:59:59`,
            isFeeCostZero: 0,
            countryId: "1"
          };

          const response = await scopedAxiosPost(
            context,
            "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/list",
            payload,
            scopedToken => ({
              headers: {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "application/json;charset=UTF-8",
                Authtoken: scopedToken,
                Lang: "ID",
                Langtype: "ID",
                Origin: "https://jfs.jtcargo.co.id",
                Referer: "https://jfs.jtcargo.co.id/",
                Routename: "dispatchWaybill",
                "User-Agent": "Mozilla/5.0"
              },
              timeout: 30000
            })
          );

          const records = Array.isArray(response?.data?.data) ? response.data.data : [];
          allRecords = allRecords.concat(records);
          if (!records.length || records.length < 100) {
            hasMore = false;
          } else {
            current++;
          }
        }

        const clean = allRecords.map(item => ({
          waybillNo: item.waybillNo || "",
          kurir: item.contractingAreaName || "",
          ongkir: item.receivePayFee || 0,
          waktu: item.dispatchTime || "",
          receiver: item.receiverName || "",
          address: item.receiverDetailedAddress || "",
          status: item.isSignName || "",
          berat: item.chargeWeight || 0,
          pembayaran: item.settlementName || "",
          service: item.expressTypeName || "",
          codStatus: item.codNeedName || "",
          codValue: item.codMoney || 0,
          barang: item.goodsName || ""
        }));

        return { success: true, total: clean.length, data: clean };
      } catch (err) {
        throw err;
      }
    }

    case "COD": {
      const date = options.date || options.operationalDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      try {
        let allRecords = [];
        let current = 1;
        let hasMore = true;

        while (hasMore && current <= 20) {
          const payload = {
            current,
            size: 100,
            revenueNetworkCode: config.networkCode,
            financeCenterId: config.financeCode || "BDO000",
            startTime: `${date} 00:00:00`,
            endTime: `${date} 23:59:59`,
            timeType: 1,
            countryId: "1",
            customerCode: "",
            dispatchStaffCode: "",
            repaymentStatus: "",
            repaymentType: "",
            salesmanRepaymentStatus: "",
            orderSource: [],
            repaymentSerialNoList: [],
            waybillNoList: [],
            isTimelyRepayment: ""
          };

          const response = await scopedAxiosPost(
            context,
            "https://jfsgw.jtcargo.co.id/codAccounting/api/collection-receipt-detail/page",
            payload,
            scopedToken => ({
              headers: {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "application/json;charset=UTF-8",
                Authtoken: scopedToken,
                lang: "ID",
                langtype: "ID",
                origin: "https://jfs.jtcargo.co.id",
                referer: "https://jfs.jtcargo.co.id/",
                routename: "collectionAccountBook",
                "user-agent": "Mozilla/5.0"
              },
              timeout: 30000
            })
          );

          const records = Array.isArray(response?.data?.data?.records) ? response.data.data.records : [];
          allRecords = allRecords.concat(records);
          if (!records.length || records.length < 100) {
            hasMore = false;
          } else {
            current++;
          }
        }

        const clean = allRecords.map(item => ({
          waybillNo: item.waybillNo || "",
          codAmount: item.codAmount || 0,
          repaymentStatus: item.repaymentStatus || 0,
          ...mapRepaymentType(item),
          signTime: item.signTime || "",
          dispatchStaffName: item.dispatchStaffName || ""
        }));

        return { success: true, total: clean.length, data: clean };
      } catch (err) {
        throw err;
      }
    }

    case "IBK": {
      const startDate = options.startDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      const endDate = options.endDate || startDate;
      try {
        const result = await executeWithScopedAuth(context, scopedToken =>
          scrapeIbkReport({
            startTime: `${startDate} 00:00:00`,
            endTime: `${endDate} 23:59:59`,
            authToken: scopedToken,
            requestFn: scopedRequestFn(context, dependencies.requestFn),
            maxPages: options.maxPages
          })
        );
        return { success: true, total: result.data.length, ...result, startDate, endDate };
      } catch (err) {
        throw err;
      }
    }

    case "OMS": {
      const startDate = options.startDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      const endDate = options.endDate || startDate;
      try {
        const list = await executeWithScopedAuth(context, scopedToken => scrapeOrderList({
          startTime: `${startDate} 00:00:00`,
          endTime: `${endDate} 23:59:59`,
          authToken: scopedToken,
          requestFn: scopedRequestFn(context, dependencies.requestFn)
        }));
        return { success: true, total: list.length, data: list };
      } catch (err) {
        throw err;
      }
    }

    case "OMS_SCHEDULING_LIST":
      return executeWithScopedAuth(context, scopedToken =>
        scrapeOmsSchedulingList(options, scopedToken, scopedRequestFn(context, dependencies.requestFn))
      );

    case "OMS_SCHEDULING_DETAIL":
      return executeWithScopedAuth(context, scopedToken =>
        scrapeOmsSchedulingDetail(options, scopedToken, scopedRequestFn(context, dependencies.requestFn))
      );

    case "INVENTORY":
      return executeWithScopedAuth(context, scopedToken => scrapeInventoryDetail({
        authToken: scopedToken,
        startDate: options.startDate,
        endDate: options.endDate,
        ...options,
        requestFn: scopedRequestFn(context, dependencies.requestFn)
      }));

    case "AGING_SIGN":
      return executeWithScopedAuth(context, scopedToken => scrapeAgingSign({
        date: options.date || options.startDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD"),
        authToken: scopedToken,
        requestFn: scopedRequestFn(context, dependencies.requestFn)
      }));

    case "WAYBILL_STATUS":
      return executeWithScopedAuth(context, scopedToken => scrapeWaybillStatus({
        waybills: options.waybillList || options.billNoList || options.waybills || [],
        startDate: options.startDate,
        endDate: options.endDate,
        scanSiteCode: config.networkCode,
        authToken: scopedToken,
        requestFn: scopedRequestFn(context, dependencies.requestFn)
      }));

    case "SENDER_DETAIL": {
      if (!options.waybillNo) {
        throw new Error("waybillNo is required for SENDER_DETAIL");
      }
      return executeWithScopedAuth(context, scopedToken => scrapeSenderDetail({
        waybillNo: String(options.waybillNo),
        authToken: scopedToken,
        requestFn: scopedRequestFn(context, dependencies.requestFn)
      }));
    }

    case "SENSITIVE_DETAIL": {
      if (!options.waybillNo) {
        throw new Error("waybillNo is required for SENSITIVE_DETAIL");
      }
      return executeWithScopedAuth(context, scopedToken => scrapeSensitiveDetail({
        waybillNo: String(options.waybillNo),
        authToken: scopedToken,
        requestFn: scopedRequestFn(context, dependencies.requestFn)
      }));
    }

    case "WAYBILL_TRACKING":
      return executeWithScopedAuth(context, scopedToken => scrapeWaybillTracking({
        waybillNo: options.waybillNo,
        authToken: scopedToken,
        requestFn: scopedRequestFn(context, dependencies.requestFn)
      }));

    case "WAYBILL_DETAIL":
      return executeWithScopedAuth(context, scopedToken => scrapeWaybillDetail({
        waybillNo: options.waybillNo,
        authToken: scopedToken,
        requestFn: scopedRequestFn(context, dependencies.requestFn)
      }));

    default:
      return {
        success: true,
        networkCode: config.networkCode,
        operation,
        message: `Dynamic scraper for ${operation} executed via context ${context.outletCode}`,
        data: []
      };
  }
}

module.exports = {
  assertNoRuntimeTestHooks,
  executeMultiOutletScraper,
  executeWithScopedAuth,
  scopedAxiosPost,
  scopedRequestFn
};
