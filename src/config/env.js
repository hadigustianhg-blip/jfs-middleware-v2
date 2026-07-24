"use strict";

function getEnv(name, fallbackValue) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallbackValue : value;
}

function getRequiredEnv(name) {
  const value = getEnv(name);

  if (value === undefined) {
    throw new Error(`Environment variable ${name} is required`);
  }

  return value;
}

function getNumberEnv(name, fallbackValue) {
  const rawValue = getEnv(name, fallbackValue);
  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }

  return value;
}

module.exports = {
  getEnv,
  getRequiredEnv,
  getNumberEnv
};
