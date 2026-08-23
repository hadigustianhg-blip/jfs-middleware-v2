"use strict";

const FormData = require("form-data");
const moment = require("moment-timezone");
const { fetchInventoryDetail } = require("./inventory-detail.service");
const { fetchAgingSignReport } = require("./aging-sign.service");
const { fetchWaybillStatusBatch } = require("./waybill-status.service");
const { scrapeOrderList } = require("../scrapers/order-scheduling.scraper");
const { scrapeSensitiveDetail } = require("../scrapers/sensitive.scraper");
const { assertJfsApplicationAuthorized } = require("../utils/request");
const {
  scrapeOmsSchedulingDetail,
  scrapeOmsSchedulingList
} = require("../scrapers/oms-scheduling.scraper");

function isScopedUnauthorized(error) {
  return error?.code === "UNAUTHORIZED" || error?.status === 401 || error?.status === 403 ||
    error?.response?.status === 401 || error?.response?.status === 403;
}

async function executeWithScopedAuth(context, operation) {
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

function scopedRequestFn(requestFn) {
  if (!requestFn) return undefined;
  return async options => assertJfsApplicationAuthorized(await requestFn(options));
}

async function executeMultiOutletScraper(context, operation, options = {}, dependencies = {}) {
  const token = await context.authManager.getAuthToken();
  const config = context.config;
  const scopedAxios = context.axiosClient;

  switch (operation) {
    case "PICKUP": {
      const date = options.date || options.operationalDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      if (Array.isArray(options.mockData)) {
        return { success: true, total: options.mockData.length, data: options.mockData };
      }
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

          const response = await scopedAxios.post(
            "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/shippingWaybillList",
            form,
            {
              headers: {
                ...form.getHeaders(),
                authtoken: token,
                "Content-Type": "application/x-www-form-urlencoded",
                lang: "ID",
                langtype: "ID",
                routename: "sendWaybillSite",
                origin: "https://jfs.jtcargo.co.id",
                referer: "https://jfs.jtcargo.co.id/",
                "user-agent": "Mozilla/5.0"
              },
              timeout: 30000
            }
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
        if (options.fallbackToMock) return { success: true, total: 0, data: [] };
        throw err;
      }
    }

    case "DISPATCH": {
      const date = options.date || options.operationalDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      if (Array.isArray(options.mockData)) {
        return { success: true, total: options.mockData.length, data: options.mockData };
      }
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

          const response = await scopedAxios.post(
            "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/list",
            payload,
            {
              headers: {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "application/json;charset=UTF-8",
                Authtoken: token,
                Lang: "ID",
                Langtype: "ID",
                Origin: "https://jfs.jtcargo.co.id",
                Referer: "https://jfs.jtcargo.co.id/",
                Routename: "dispatchWaybill",
                "User-Agent": "Mozilla/5.0"
              },
              timeout: 30000
            }
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
        if (options.fallbackToMock) return { success: true, total: 0, data: [] };
        throw err;
      }
    }

    case "COD": {
      const date = options.date || options.operationalDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      if (Array.isArray(options.mockData)) {
        return { success: true, total: options.mockData.length, data: options.mockData };
      }
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

          const response = await scopedAxios.post(
            "https://jfsgw.jtcargo.co.id/codAccounting/api/collection-receipt-detail/page",
            payload,
            {
              headers: {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "application/json;charset=UTF-8",
                authtoken: token,
                lang: "ID",
                langtype: "ID",
                origin: "https://jfs.jtcargo.co.id",
                referer: "https://jfs.jtcargo.co.id/",
                routename: "collectionReceiptDetail",
                "user-agent": "Mozilla/5.0"
              },
              timeout: 30000
            }
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
          codAmount: item.codMoney || item.codAmount || 0,
          repaymentStatus: item.repaymentStatus || null,
          repaymentType: item.repaymentType || null,
          signedAt: item.signTime || item.signedAt || "",
          courierName: item.dispatchStaffName || item.courierName || ""
        }));

        return { success: true, total: clean.length, data: clean };
      } catch (err) {
        if (options.fallbackToMock) return { success: true, total: 0, data: [] };
        throw err;
      }
    }

    case "IBK": {
      const startDate = options.startDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      const endDate = options.endDate || startDate;
      if (Array.isArray(options.mockData)) {
        return { success: true, total: options.mockData.length, data: options.mockData, startDate, endDate };
      }
      try {
        const response = await scopedAxios.post(
          "https://jfsgw.jtcargo.co.id/cash/ibk-report/list",
          {
            networkCode: config.networkCode,
            startDate,
            endDate
          },
          {
            headers: {
              authtoken: token,
              "Content-Type": "application/json"
            },
            timeout: 30000
          }
        );
        const data = Array.isArray(response?.data?.data) ? response.data.data : [];
        return { success: true, total: data.length, data, startDate, endDate };
      } catch (err) {
        if (options.fallbackToMock) return { success: true, total: 0, data: [], startDate, endDate };
        throw err;
      }
    }

    case "OMS": {
      const startDate = options.startDate || moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
      const endDate = options.endDate || startDate;
      if (Array.isArray(options.mockData)) {
        return { success: true, total: options.mockData.length, data: options.mockData };
      }
      try {
        const list = await scrapeOrderList({
          startTime: `${startDate} 00:00:00`,
          endTime: `${endDate} 23:59:59`,
          authToken: token,
          requestFn: context.request
        });
        return { success: true, total: list.length, data: list };
      } catch (err) {
        if (options.fallbackToMock) return { success: true, total: 0, data: [] };
        throw err;
      }
    }

    case "OMS_SCHEDULING_LIST":
      return executeWithScopedAuth(context, scopedToken =>
        scrapeOmsSchedulingList(options, scopedToken, scopedRequestFn(dependencies.requestFn || context.request))
      );

    case "OMS_SCHEDULING_DETAIL":
      return executeWithScopedAuth(context, scopedToken =>
        scrapeOmsSchedulingDetail(options, scopedToken, scopedRequestFn(dependencies.requestFn || context.request))
      );

    case "INVENTORY":
      return fetchInventoryDetail({
        token,
        networkCode: config.networkCode,
        startDate: options.startDate,
        endDate: options.endDate,
        ...options
      });

    case "AGING_SIGN":
      return fetchAgingSignReport({
        token,
        networkCode: config.networkCode,
        startDate: options.startDate,
        endDate: options.endDate,
        ...options
      });

    case "WAYBILL_STATUS":
      return fetchWaybillStatusBatch({
        token,
        waybillList: options.waybillList || options.billNoList || [],
        ...options
      });

    case "SENDER_DETAIL": {
      if (!options.waybillNo) {
        throw new Error("waybillNo is required for SENDER_DETAIL");
      }
      return scrapeSensitiveDetail({
        waybillNo: String(options.waybillNo),
        authToken: token
      });
    }

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
  executeMultiOutletScraper,
  executeWithScopedAuth,
  scopedRequestFn
};
