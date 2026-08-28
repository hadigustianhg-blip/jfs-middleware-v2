"use strict";

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function sendSuccess(res, payload) {
  return sendJson(res, 200, payload);
}

function sendError(res, statusCode, payload) {
  return sendJson(res, statusCode, payload);
}

module.exports = {
  sendJson,
  sendSuccess,
  sendError
};
