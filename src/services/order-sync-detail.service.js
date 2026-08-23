"use strict";

const logger = require("../utils/logger");

const DETAIL_CONCURRENCY = 3;
const DETAIL_BATCH_DELAY_MS = 250;

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function mapOrderSyncRecord(record = {}, syncTime = "") {
  return {
    id: record.id || "",

    orderSourceName: record.orderSourceName || "",
    orderSourceCode: record.orderSourceCode || "",

    waybillId: record.waybillId || "",

    customerName: record.customerName || "",
    customerCode: record.customerCode || "",

    status: record.orderStatusName || "",
    statusCode: record.orderStatusCode || "",

    senderName: record.senderName || "",
    senderCompany: record.senderCompany || "",
    senderPhone: record.senderMobilePhone || "",
    senderProvince: record.senderProvinceName || "",
    senderCity: record.senderCityName || "",
    senderArea: record.senderAreaName || "",
    senderAddress: record.senderDetailedAddress || "",

    receiverName: record.receiverName || "",
    receiverPhone: record.receiverMobilePhone || "",
    receiverProvince: record.receiverProvinceName || "",
    receiverCity: record.receiverCityName || "",
    receiverArea: record.receiverAreaName || "",
    receiverAddress: record.receiverDetailedAddress || "",

    goodsName: record.goodsName || "",
    goodsType: record.goodsTypeName || "",

    weight: record.packageTotalWeight || 0,
    packageNumber: record.packageNumber || 0,

    expressType: record.expressTypeName || "",
    expressTypeCode: record.expressTypeCode || "",

    paymentMode: record.paymentModeName || "",

    sendName: record.sendName || "",
    sendCode: record.sendCode || "",

    pickNetwork: record.pickNetworkName || "",
    pickNetworkCode: record.pickNetworkCode || "",

    proxyArea: record.proxyAreaName || "",
    proxyAreaCode: record.proxyAreaCode || "",

    customerOrderTime: record.customerOrderTime || "",
    dispatchNetworkTime: record.dispatchNetworkTime || "",
    inputTime: record.inputTime || "",

    syncTime
  };
}

async function processOrderDetailBatch(
  orders,
  {
    fetchDetail,
    concurrency = DETAIL_CONCURRENCY,
    batchDelayMs = DETAIL_BATCH_DELAY_MS,
    wait = delay,
    getSyncTime = () => ""
  }
) {
  if (!Array.isArray(orders)) {
    throw new TypeError("orders must be an array");
  }

  if (typeof fetchDetail !== "function") {
    throw new TypeError("fetchDetail must be a function");
  }

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new RangeError("concurrency must be between 1 and 3");
  }

  const result = new Array(orders.length);

  for (let offset = 0; offset < orders.length; offset += concurrency) {
    const batch = orders.slice(offset, offset + concurrency);

    await Promise.all(
      batch.map(async (item, batchIndex) => {
        const resultIndex = offset + batchIndex;

        try {
          const detail = await fetchDetail(item);
          result[resultIndex] = mapOrderSyncRecord(detail, getSyncTime());
        } catch (error) {
          result[resultIndex] = mapOrderSyncRecord(item, getSyncTime());
          logger.warn("OMS order detail unavailable; using list fallback", {
            resultIndex,
            status: error?.status ?? error?.response?.status,
            code: error?.code
          });
        }
      })
    );

    if (offset + concurrency < orders.length) {
      await wait(batchDelayMs);
    }
  }

  return result;
}

module.exports = {
  DETAIL_BATCH_DELAY_MS,
  DETAIL_CONCURRENCY,
  mapOrderSyncRecord,
  processOrderDetailBatch
};
