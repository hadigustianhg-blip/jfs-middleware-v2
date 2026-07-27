"use strict";

const express = require("express");

function createWaybillStatusRoutes({ getWaybillStatusBatch }) {
  const router = express.Router();
  router.post("/jfs-waybill-status-batch", getWaybillStatusBatch);
  return router;
}

module.exports = {
  createWaybillStatusRoutes
};
