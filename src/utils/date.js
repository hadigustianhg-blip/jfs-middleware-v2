"use strict";

const moment = require("moment-timezone");
const { DEFAULT_TIMEZONE } = require("../config/constants");

const DATE_FORMAT = "YYYY-MM-DD";
const DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
const INPUT_FORMATS = [DATE_FORMAT, DATE_TIME_FORMAT, moment.ISO_8601];

function parseDateInput(value) {
  if (value === undefined || value === null || value === "") {
    throw new TypeError("Date value is required");
  }

  const parsed = moment.isMoment(value)
    ? value.clone().tz(DEFAULT_TIMEZONE)
    : moment.tz(value, INPUT_FORMATS, true, DEFAULT_TIMEZONE);

  if (!parsed.isValid()) {
    throw new TypeError("Invalid date value");
  }

  return parsed;
}

// Returns YYYY-MM-DD in Asia/Jakarta.
function formatDateJakarta(date) {
  return parseDateInput(date).format(DATE_FORMAT);
}

function formatDateOnlyJakarta(date) {
  return formatDateJakarta(date);
}

// Returns YYYY-MM-DD HH:mm:ss in Asia/Jakarta.
function formatDateTimeJakarta(date) {
  return parseDateInput(date).format(DATE_TIME_FORMAT);
}

function getTodayJakarta() {
  return moment().tz(DEFAULT_TIMEZONE).format(DATE_FORMAT);
}

function getStartOfDayJakarta(date) {
  return parseDateInput(date).startOf("day").format(DATE_TIME_FORMAT);
}

function getEndOfDayJakarta(date) {
  return parseDateInput(date).endOf("day").format(DATE_TIME_FORMAT);
}

function validateDateRange(beginDate, endDate) {
  const begin = parseDateInput(beginDate);
  const end = parseDateInput(endDate);

  if (begin.isAfter(end)) {
    throw new RangeError("Begin date must not be after end date");
  }

  return {
    beginDate: begin.format(DATE_TIME_FORMAT),
    endDate: end.format(DATE_TIME_FORMAT)
  };
}

module.exports = {
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  formatDateJakarta,
  formatDateOnlyJakarta,
  formatDateTimeJakarta,
  getTodayJakarta,
  getStartOfDayJakarta,
  getEndOfDayJakarta,
  parseDateInput,
  validateDateRange
};
