"use strict";

const express = require("express");

function createJfsAuthRoutes({ login }) {
  const router = express.Router();
  router.post("/jfs-auth/login", login);
  return router;
}

module.exports = {
  createJfsAuthRoutes
};
