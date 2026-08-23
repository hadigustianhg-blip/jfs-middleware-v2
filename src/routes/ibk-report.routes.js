"use strict";

const express = require("express");

function createIbkReportRoutes({ getIbkReport }) {
  const router = express.Router();
  router.get("/jfs-ibk-report", getIbkReport);
  return router;
}

module.exports = {
  createIbkReportRoutes
};
