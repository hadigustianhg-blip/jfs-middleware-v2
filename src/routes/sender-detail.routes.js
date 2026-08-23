"use strict";

const express = require("express");

function createSenderDetailRoutes({ getSenderDetail }) {
  const router = express.Router();
  router.get("/jfs-sender-detail", getSenderDetail);
  return router;
}

module.exports = {
  createSenderDetailRoutes
};
