"use strict";

const { externalRequest } = require("../utils/request");

const ABNORMAL_PIECE_URL =
  "https://jfsgw.jtcargo.co.id/operatingplatform/abnormalPieceScanList/pageList";

function buildAbnormalPiecePayload(waybillId) {
  return {
    current: 1,
    size: 100,
    waybillId,
    countryId: "1"
  };
}

function buildAbnormalPieceHeaders(authToken) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=UTF-8",
    Authtoken: authToken,
    Lang: "ID",
    Langtype: "ID",
    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",
    Routename: "trackingExpress",
    "User-Agent": "Mozilla/5.0"
  };
}

function mapAbnormalPieceRecord(item = {}) {
  return {
    waybillId: item.waybillId ?? "",
    abnormalPieceName: item.abnormalPieceName ?? "",
    operatorCode: item.operatorCode ?? "",
    operatorName: item.operatorName ?? "",
    scanBy: item.scanBy ?? 0,
    scanByCode: item.scanByCode ?? "",
    scanByName: item.scanByName ?? "",
    scanNetworkCode: item.scanNetworkCode ?? "",
    dataCollectionTime: item.dataCollectionTime ?? "",
    scanTime: item.scanTime ?? "",
    remark: item.remark ?? ""
  };
}

function extractAbnormalPieceRecords(response) {
  const data = response?.data?.data;

  if (Array.isArray(data?.records)) {
    return data.records;
  }
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(response?.data?.records)) {
    return response.data.records;
  }
  return [];
}

async function scrapeAbnormalPiece({
  waybillId,
  authToken,
  requestFn = externalRequest
}) {
  const response = await requestFn({
    method: "POST",
    url: ABNORMAL_PIECE_URL,
    body: buildAbnormalPiecePayload(waybillId),
    headers: buildAbnormalPieceHeaders(authToken)
  });

  return {
    data: extractAbnormalPieceRecords(response).map(mapAbnormalPieceRecord)
  };
}

module.exports = {
  ABNORMAL_PIECE_URL,
  buildAbnormalPieceHeaders,
  buildAbnormalPiecePayload,
  extractAbnormalPieceRecords,
  mapAbnormalPieceRecord,
  scrapeAbnormalPiece
};
