const express = require("express");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
const moment = require("moment-timezone");

const app = express();

app.use(cors());
app.use(express.json());

// 🔐 TOKEN
let AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("API JFS Middleware (Pickup + Dispatch) 🚀");
});

// ================= SET TOKEN =================
app.get("/set-token", (req, res) => {
  if (!req.query.token) {
    return res.status(400).json({ error: "Token wajib diisi" });
  }

  AUTH_TOKEN = req.query.token;

  res.json({
    message: "Token berhasil diupdate",
    token: AUTH_TOKEN
  });
});

// ================= COMMON HEADER =================
function getHeaders(route) {
  return {
    authtoken: AUTH_TOKEN,
    "Content-Type": "application/x-www-form-urlencoded", // 🔥 FIX
    lang: "ID",
    langtype: "ID",
    routename: route,

    origin: "https://jfs.jtcargo.co.id",
    referer: "https://jfs.jtcargo.co.id/",

    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
  };
}

// ================= ERROR HANDLER =================
function handleError(error, res, label) {
  console.error(label, error.response?.data || error.message);

  if (error.response?.data?.code === 401) {
    return res.status(401).json({
      error: "TOKEN EXPIRED",
      detail: "Silakan update token JFS"
    });
  }

  res.status(500).json({
    error: label,
    detail: error.response?.data || error.message
  });
}

// ================= PICKUP =================
app.get("/jfs-pickup", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({ error: "Token kosong" });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    while (hasMore) {
      const form = new FormData();

      form.append("current", current);
      form.append("size", 100);

      form.append("pickFinanceCode", "BDO000");
      form.append("pickNetworkCode", "SUM001A");

      form.append("isVoid", "0");

      form.append("timeStart", `${date} 00:00:00`);
      form.append("timeEnd", `${date} 23:59:59`);

      form.append("inputTimeStart", `${date} 00:00:00`);
      form.append("inputTimeEnd", `${date} 23:59:59`);

      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/shippingWaybillList",
        form,
        {
          headers: {
            ...form.getHeaders(),
            ...getHeaders("sendWaybillSite")
          }
        }
      );

      const records = response?.data?.data || [];

      console.log("PICKUP PAGE:", current, records.length);

      allRecords = allRecords.concat(records);

      if (!records || records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }
    }

    // =========================
    // FORMAT DATA UNTUK GSHEET
    // =========================

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

    res.json({
      total: clean.length,
      data: clean
    });

  } catch (error) {
    handleError(error, res, "Gagal ambil data pickup");
  }
});

// ================= DISPATCH =================
app.get("/jfs-dispatch", async (req, res) => {
  try {

    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    const date =
      req.query.date ||
      moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    const maxPage = 20;

    while (hasMore && current <= maxPage) {

      const payload = {
        current: current,
        size: 100,

        oneNetwork: "BDO000",

        dispatchFinanceCode: "BDO000",
        dispatchFinanceId: 183,

        searchTimeType: 1,

        startTime: `${date} 00:00:00`,
        endTime: `${date} 23:59:59`,

        isFeeCostZero: 0,
        countryId: "1"
      };

      console.log("PAYLOAD:", payload);

      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/list",
        payload,
        {
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",

            "Authtoken": AUTH_TOKEN,

            "Lang": "ID",
            "Langtype": "ID",

            "Origin": "https://jfs.jtcargo.co.id",
            "Referer": "https://jfs.jtcargo.co.id/",

            "Routename": "dispatchWaybill",

            "User-Agent":
              "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
          }
        }
      );

      const resData = response?.data;

      console.log(
        "RAW RESPONSE:",
        JSON.stringify(resData).slice(0, 1000)
      );

      const records =
        Array.isArray(resData?.data)
          ? resData.data
          : [];

      console.log(
        "DISPATCH PAGE:",
        current,
        records.length
      );

      allRecords = allRecords.concat(records);

      if (!records.length || records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }

      await new Promise(r => setTimeout(r, 300));
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

    res.json({
      success: true,
      total: clean.length,
      page: current - 1,
      data: clean
    });

  } catch (error) {

    console.error(
      "ERROR DISPATCH:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Gagal ambil data dispatch",
      detail:
        error.response?.data ||
        error.message
    });
  }
});

// ================= AGING SIGN =================
app.get("/jfs-aging-sign", async (req, res) => {

  try {

    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    const date =
      req.query.date ||
      moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    const payload = {

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

    const response = await axios.post(

      "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination?sqlCode=realtime_bus_aging_sign_sum_nd&dcr_key=57b048fb-bc8c-4d24-982b-a750b7ce8693",

      payload,

      {
        headers: {

          "Accept": "application/json, text/plain, */*",

          "Content-Type": "application/json;charset=UTF-8",

          "Authtoken": AUTH_TOKEN,

          "Lang": "ID",
          "Langtype": "ID",

          "Origin": "https://jfs.jtcargo.co.id",

          "Referer": "https://jfs.jtcargo.co.id/",

          "Routename": "Bd-theme-42cb1bb7-3560-47e0-923a-f87ea5f7b1fe",

          "User-Agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"
        }
      }
    );

    const records =
      response?.data?.data?.records || [];

    const clean = records.map(item => ({

      signTimelyTotal: item.signTimelyTotal || 0,

      networkName: item.networkName || "",

      signDelayOtherTotal: item.signDelayOtherTotal || 0,

      signTimelyRate: item.signTimelyRate || "0%",

      problemOtherTotal: item.problemOtherTotal || 0,

      queryTime: item.queryTime || "",

      sendCenterTotal: item.sendCenterTotal || 0,

      signDelayNoSignTotal: item.signDelayNoSignTotal || 0

    }));

    res.json({

      success: true,

      total: clean.length,

      data: clean

    });

  } catch (error) {

    console.error(
      "ERROR AGING SIGN:",
      error.response?.data || error.message
    );

    res.status(500).json({

      error: "Gagal ambil aging sign",

      detail:
        error.response?.data ||
        error.message
    });
  }
});

// ================= JFS COD =================
app.get("/jfs-cod", async (req, res) => {
  try {

    // =========================
    // CHECK TOKEN
    // =========================
    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    // =========================
    // DATE WIB
    // =========================
    const date =
      req.query.date ||
      moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    const maxPage = 20;

    while (hasMore && current <= maxPage) {

      // =========================
      // PAYLOAD
      // =========================
      const payload = {
        current: current,
        size: 100,

        revenueNetworkCode: "SUM001A",

        financeCenterId: "BDO000",

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

      console.log("COD PAYLOAD:", payload);

      // =========================
      // REQUEST
      // =========================
      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/codAccounting/api/collection-receipt-detail/page",
        payload,
        {
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",

            "Authtoken": AUTH_TOKEN,

            "Lang": "ID",
            "Langtype": "ID",

            "Origin": "https://jfs.jtcargo.co.id",
            "Referer": "https://jfs.jtcargo.co.id/",

            "Routename": "collectionAccountBook",

            "User-Agent":
              "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
          }
        }
      );

      const resData = response?.data;

      console.log(
        "RAW COD:",
        JSON.stringify(resData).slice(0, 1000)
      );

      // =========================
      // RECORDS
      // =========================
      const records =
        resData?.data?.records || [];

      console.log(
        "COD PAGE:",
        current,
        records.length
      );

      allRecords = allRecords.concat(records);

      // =========================
      // STOP PAGINATION
      // =========================
      if (!records.length || records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }

      // anti limit
      await new Promise(r => setTimeout(r, 300));
    }

    // =========================
    // FORMAT DATA
    // =========================
    const clean = allRecords.map(item => ({

      waybillNo: item.waybillNo || "",

      codAmount: item.codAmount || 0,

      repaymentStatus: item.repaymentStatus || 0,

      repaymentType: item.repaymentType || 0,

      signTime: item.signTime || "",

      dispatchStaffName:
        item.dispatchStaffName || ""

    }));

    // =========================
    // RESPONSE
    // =========================
    res.json({
      success: true,
      total: clean.length,
      page: current - 1,
      data: clean
    });

  } catch (error) {

    console.error(
      "ERROR COD:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Gagal ambil data COD",
      detail:
        error.response?.data ||
        error.message
    });
  }
});

// ================= IBK REPORT =================
app.get("/jfs-ibk-report", async (req, res) => {

  try {

    // =========================
    // CHECK TOKEN
    // =========================
    if (!AUTH_TOKEN) {

      return res.status(400).json({
        error: "Token kosong"
      });

    }

    // =========================
    // DATE WIB
    // =========================
    const today =
      moment()
        .tz("Asia/Jakarta");

    const startDate =
      today
        .clone()
        .subtract(1, "day")
        .format("YYYY-MM-DD") +
      " 00:00:00";

    const endDate =
      today.format("YYYY-MM-DD") +
      " 23:59:59";

    let allRecords = [];

    let current = 1;

    let hasMore = true;

    const maxPage = 20;

    while (hasMore && current <= maxPage) {

      // =========================
      // PAYLOAD
      // =========================
      const payload = {

        current: current,

        size: 100,

        financialCenterId: 183,

        networkId: 2015,

        timeType: 1,

        searchType: 1,

        countryId: "1",

        recordStartTime:
          startDate,

        recordEndTime:
          endDate

      };

      console.log(
        "IBK REPORT PAYLOAD:",
        payload
      );

      // =========================
      // REQUEST
      // =========================
      const response = await axios.post(

        "https://jfsgw.jtcargo.co.id/financialmanagement/ibkFundRecord/report?current=1&size=100",

        payload,

        {

          headers: {

            "Accept":
              "application/json, text/plain, */*",

            "Content-Type":
              "application/json;charset=UTF-8",

            "Authtoken":
              AUTH_TOKEN,

            "Lang": "ID",

            "Langtype": "ID",

            "Origin":
              "https://jfs.jtcargo.co.id",

            "Referer":
              "https://jfs.jtcargo.co.id/",

            "Routename":
              "advancePaymentQuery",

            "User-Agent":
              "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"

          }

        }
      );

      const resData =
        response?.data;

      console.log(
        "RAW IBK REPORT:",
        JSON.stringify(resData).slice(0, 1000)
      );

      // =========================
      // RECORDS
      // =========================
      const records =
        resData?.data?.records || [];

      console.log(
        "IBK REPORT PAGE:",
        current,
        records.length
      );

      allRecords =
        allRecords.concat(records);

      // =========================
      // STOP PAGINATION
      // =========================
      if (!records.length || records.length < 100) {

        hasMore = false;

      } else {

        current++;

      }

      // anti limit
      await new Promise(r =>
        setTimeout(r, 300)
      );

    }

    // =========================
    // FORMAT DATA
    // =========================
    const clean = allRecords.map(item => ({

      networkName:
        item.networkName || "",

      tradeType:
        item.tradeType || 0,

      feeTypeName:
        item.feeTypeName || "",

      feeItemTypeName:
        item.feeItemTypeName || "",

      date:
        item.date || "",

      amount:
        item.amount || 0

    }));

    // =========================
    // RESPONSE
    // =========================
    res.json({

      success: true,

      total: clean.length,

      page: current - 1,

      data: clean

    });

  } catch (error) {

    console.error(
      "ERROR IBK REPORT:",
      error.response?.data || error.message
    );

    res.status(500).json({

      error:
        "Gagal ambil data IBK REPORT",

      detail:
        error.response?.data ||
        error.message

    });

  }

});
// ================= SECRET INFO =================
app.get("/jfs-sensitive", async (req, res) => {

  try {

    if (!AUTH_TOKEN) {

      return res.status(400).json({
        error: "Token kosong"
      });

    }

    const waybillNo =
      req.query.waybillNo;

    console.log(
      "SENSITIVE REQUEST:",
      waybillNo
    );

    const response =
      await axios({

        method: "POST",

        url:
          "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/sensitiveDetailByWaybillNo",

        params: {

          waybillNo:
            waybillNo,

          chanel: 2

        },

        headers: {

          "Accept":
            "application/json, text/plain, */*",

          "Content-Type":
            "application/json;charset=UTF-8",

          "Authtoken":
            AUTH_TOKEN,

          "Lang":
            "ID",

          "Langtype":
            "ID",

          "Origin":
            "https://jfs.jtcargo.co.id",

          "Referer":
            "https://jfs.jtcargo.co.id/",

          "Routename":
            "dispatchWaybill",

          "User-Agent":
            "Mozilla/5.0"

        },

        data: {

          countryId: "1"

        }

      });

    console.log(
      "SENSITIVE SUCCESS"
    );

    const d =
      response.data.data || {};

    res.json({

      success: true,

      data: {

        waybillNo:
          d.waybillNo || "",

        dispatchTime:
          d.dispatchTime || "",

        dispatchStaffName:
          d.dispatchStaffName || "",

        receiverName:
          d.receiverName || "",

        receiverMobilePhone:
          d.receiverMobilePhone || "",

        receiverTelphone:
          d.receiverTelphone || "",

        receiverDetailedAddress:
          d.receiverDetailedAddress || "",

        chargeWeight:
          d.chargeWeight || 0,

        abnormalName:
          d.abnormalName || "",

        updateTime:
          d.updateTime || "",

        codMoney:
          d.codMoney || 0,

        goodsName:
          d.goodsName || ""

      }

    });

  } catch (err) {

    console.log(
      "SENSITIVE ERROR:",
      err.response?.data ||
      err.message
    );

    res.status(500).json({

      success: false,

      error:
        err.response?.data ||
        err.message

    });

  }

});

function getOmsHeaders(route) {
  return {
    Authtoken: AUTH_TOKEN,

    Lang: "ID",
    Langtype: "ID",

    Routename: route,

    Origin: "https://jfs.jtcargo.co.id",
    Referer: "https://jfs.jtcargo.co.id/",

    Accept: "application/json, text/plain, */*",

    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
  };
}
// ================= OMS ORDER SYNC =================
app.get("/jfs-order-sync", async (req, res) => {

  try {

    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    const startTime =
  req.query.start ||
  moment()
    .tz("Asia/Jakarta")
    .startOf("month")
    .format("YYYY-MM-DD HH:mm:ss");

const endTime =
  req.query.end ||
  moment()
    .tz("Asia/Jakarta")
    .format("YYYY-MM-DD HH:mm:ss");

    let current = 1;
    let hasMore = true;

    let allOrders = [];

    while (hasMore) {

      const form = new FormData();

form.append("current", current);

form.append("size", 100);

form.append(
  "startInputTime",
  startTime
);

form.append(
  "endInputTime",
  endTime
);

form.append(
  "timeType",
  1
);

form.append(
  "orderStatusCode",
  "106,100,101,102,105"
);

form.append(
  "sendCode",
  "01"
);

form.append(
  "startPickTime",
  ""
);

form.append(
  "endPickTime",
  ""
);

      

      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/customerplatform/omsOrderDispatch/page",
        form,
        {
          headers: {
            ...form.getHeaders(),
            ...getOmsHeaders("orderScheduling")
          }
        }
      );

      const records =
        response?.data?.data?.records || [];

      console.log(
        "OMS PAGE:",
        current,
        records.length
      );

      allOrders =
        allOrders.concat(records);

      if (
        !records.length ||
        records.length < 100
      ) {
        hasMore = false;
      } else {
        current++;
      }

      await new Promise(r =>
        setTimeout(r, 1500)
      );
    }

    console.log(
      "TOTAL ORDER:",
      allOrders.length
    );

    const result = [];

    for (const item of allOrders) {

      try {

        console.log(
          "DETAIL REQUEST:",
          item.id
        );

        const detail =
          await axios.get(
            "https://jfsgw.jtcargo.co.id/customerplatform/omsOrder/detailDispatchByLog",
            {
              params: {
                id: item.id
              },
              headers: {
                ...getOmsHeaders(
                  "orderScheduling"
                )
              }
            }
          );

        const d =
          detail?.data?.data || {};

        console.log(
          "DETAIL SUCCESS:",
          item.id
        );

       result.push({

  id: d.id || "",

  orderSourceName: d.orderSourceName || "",
  orderSourceCode: d.orderSourceCode || "",

  waybillId: d.waybillId || "",

  customerName: d.customerName || "",
  customerCode: d.customerCode || "",

  status: d.orderStatusName || "",
  statusCode: d.orderStatusCode || "",

  senderName: d.senderName || "",
  senderCompany: d.senderCompany || "",
  senderPhone: d.senderMobilePhone || "",
  senderProvince: d.senderProvinceName || "",
  senderCity: d.senderCityName || "",
  senderArea: d.senderAreaName || "",
  senderAddress: d.senderDetailedAddress || "",

  receiverName: d.receiverName || "",
  receiverPhone: d.receiverMobilePhone || "",
  receiverProvince: d.receiverProvinceName || "",
  receiverCity: d.receiverCityName || "",
  receiverArea: d.receiverAreaName || "",
  receiverAddress: d.receiverDetailedAddress || "",

  goodsName: d.goodsName || "",
  goodsType: d.goodsTypeName || "",

  weight: d.packageTotalWeight || 0,
  packageNumber: d.packageNumber || 0,

  expressType: d.expressTypeName || "",
  expressTypeCode: d.expressTypeCode || "",

  paymentMode: d.paymentModeName || "",

  sendName: d.sendName || "",
  sendCode: d.sendCode || "",

  pickNetwork: d.pickNetworkName || "",
  pickNetworkCode: d.pickNetworkCode || "",

  proxyArea: d.proxyAreaName || "",
  proxyAreaCode: d.proxyAreaCode || "",

  customerOrderTime: d.customerOrderTime || "",
  dispatchNetworkTime: d.dispatchNetworkTime || "",
  inputTime: d.inputTime || "",

  syncTime: moment()
    .tz("Asia/Jakarta")
    .format("YYYY-MM-DD HH:mm:ss")

});

      } catch (err) {

        console.log(
          "DETAIL ERROR:",
          item.id
        );

        console.log(
          "STATUS:",
          err.response?.status
        );

        console.log(
          "DATA:",
          JSON.stringify(
            err.response?.data,
            null,
            2
          )
        );

      }

      await new Promise(r =>
        setTimeout(r, 1500)
      );

    }

    res.json({

      success: true,

      total: result.length,

      startTime,
      endTime,

      syncTime:
        moment()
          .tz("Asia/Jakarta")
          .format(
            "YYYY-MM-DD HH:mm:ss"
          ),

      data: result

    });

  } catch (error) {

    console.error(
      "OMS SYNC ERROR:",
      error.response?.data ||
      error.message
    );

    res.status(500).json({

      success: false,

      error:
        error.response?.data ||
        error.message

    });

  }

});

// ================= OPS CHECK INVENTORY =================
// Alur:
//   1. Ambil daftar "Nomor Tugas" dari queryOpsCheckForPage
//   2. Untuk setiap checkCode, ambil detail inventaris
//   3. Return data detail ke spreadsheet
//
// Cara pakai:
//   GET /jfs-inventory              → otomatis hari ini WIB
//   GET /jfs-inventory?date=2026-06-02  → tanggal tertentu

app.get("/jfs-inventory", async (req, res) => {
  try {

    // =========================
    // CHECK TOKEN
    // =========================
    if (!AUTH_TOKEN) {
      return res.status(400).json({ error: "Token kosong" });
    }

    // =========================
    // TANGGAL DINAMIS (default: hari ini WIB)
    // =========================
    const date = req.query.date
      ? req.query.date
      : moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    const startScanTime = `${date} 00:00:00`;
    const endScanTime   = `${date} 23:59:59`;

    console.log(`[INVENTORY] Tanggal: ${date}`);

    // =========================
    // SHARED HEADERS
    // =========================
    const inventoryHeaders = {
      "Accept":       "application/json, text/plain, */*",
      "Content-Type": "application/json;charset=UTF-8",
      "Authtoken":    AUTH_TOKEN,
      "Lang":         "ID",
      "Langtype":     "ID",
      "Routename":    "opsCheckPage",
      "Origin":       "https://jfs.jtcargo.co.id",
      "Referer":      "https://jfs.jtcargo.co.id/",
      "User-Agent":   "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"
    };

    // =========================
    // STEP 1: AMBIL SEMUA NOMOR TUGAS
    // =========================
    let allCheckCodes = [];
    let page1 = 1;
    let hasMore1 = true;

    console.log("[STEP 1] Ambil Nomor Tugas...");

    while (hasMore1) {
      const payload = {
        current:       page1,
        size:          20,
        checkCodes:    [],
        startScanTime: startScanTime,
        endScanTime:   endScanTime,
        searchType:    1,
        countryId:     "1"
      };

      const res1 = await axios.post(
        "https://jfsgw.jtcargo.co.id/operatingplatform/opsCheck/queryOpsCheckForPage",
        payload,
        { headers: inventoryHeaders }
      );

      const records = res1?.data?.data?.records || [];
      console.log(`[STEP 1] Page ${page1}: ${records.length} record`);

      const codes = records
        .filter(r => r.checkCode)
        .map(r => r.checkCode);

      allCheckCodes = allCheckCodes.concat(codes);

      if (!records.length || records.length < 20) {
        hasMore1 = false;
      } else {
        page1++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[STEP 1] Total Nomor Tugas: ${allCheckCodes.length}`);

    if (!allCheckCodes.length) {
      return res.json({
        success: true,
        date:    date,
        total:   0,
        data:    []
      });
    }

    // =========================
    // STEP 2: AMBIL DETAIL PER checkCode
    // =========================
    let allDetails = [];

    console.log("[STEP 2] Ambil Detail Inventaris...");

    for (const checkCode of allCheckCodes) {

      let page2 = 1;
      let hasMore2 = true;

      while (hasMore2) {
        const detailPayload = {
          current:   page2,
          size:      20,
          checkCode: checkCode,
          countryId: "1"
        };

        console.log(`[STEP 2] ${checkCode} Page ${page2}`);

        const res2 = await axios.post(
          "https://jfsgw.jtcargo.co.id/operatingplatform/opsCheck/queryOpsCheckDetailForPage",
          detailPayload,
          { headers: inventoryHeaders }
        );

        const details = res2?.data?.data?.records || [];
        console.log(`[STEP 2] ${checkCode} Page ${page2}: ${details.length} detail`);

        // Format data sesuai screenshot
        const cleaned = details.map(item => ({
          billCode:            item.billCode            || "",
          waybillNo:           item.waybillNo           || "",
          checkCode:           item.checkCode           || "",
          checkNetworkName:    item.checkNetworkName    || "",
          checkNetworkCode:    item.checkNetworkCode    || "",
          status:              item.status              ?? "",
          checkUser:           item.checkUser           || "",
          checkTime:           item.checkTime           || "",
          inStockTime:         item.inStockTime         || "",
          codMoney:            item.codMoney            || 0,
          dfodCodMoney:        item.dfodCodMoney        || 0,
          secondLevelTypeName: item.secondLevelTypeName || "",
          stockTime:           item.stockTime           || 0,
          planSignTime:        item.planSignTime        || "",
          fieldFilled:         item.fieldFilled         ?? "",
          rebackStatus:        item.rebackStatus        ?? ""
        }));

        allDetails = allDetails.concat(cleaned);

        if (!details.length || details.length < 20) {
          hasMore2 = false;
        } else {
          page2++;
        }

        await new Promise(r => setTimeout(r, 300));
      }
    }

    // =========================
    // RESPONSE
    // =========================
    console.log(`[INVENTORY] Total Detail: ${allDetails.length}`);

    res.json({
      success:        true,
      date:           date,
      totalCheckCode: allCheckCodes.length,
      total:          allDetails.length,
      data:           allDetails
    });

  } catch (error) {

    console.error("[ERROR INVENTORY]", error.response?.data || error.message);

    if (error.response?.data?.code === 401) {
      return res.status(401).json({
        error:  "TOKEN EXPIRED",
        detail: "Silakan update token JFS"
      });
    }

    res.status(500).json({
      error:  "Gagal ambil data inventory",
      detail: error.response?.data || error.message
    });
  }
});

// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
