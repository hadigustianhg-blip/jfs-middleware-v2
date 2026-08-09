"use strict";

const { createJfsOutletContext, JfsOutletContextError } = require("./jfs-outlet-context");
const {
  createOutletContextRegistry,
  globalRegistry,
  OutletRegistryError
} = require("./outlet-context-registry");
const { createJfsHttpClient } = require("./jfs-http-client");
const {
  assertExpectedNetworkCode,
  JfsNetworkMismatchError
} = require("./network-validation");
const {
  bootstrapOutletContexts,
  parseContextDefinitionsFromEnv,
  ContextBootstrapError
} = require("./trusted-context-bootstrap");
const {
  resolveTrustedOutletContext,
  extractContextKeyFromHeaders,
  resolveContextFromRequest,
  ContextResolverError,
  CONTEXT_KEY_HEADER,
  CALLER_AUTH_HEADER
} = require("./trusted-context-resolver");
const {
  isMultiOutletEnabled,
  initializeMultiOutletRuntime
} = require("./runtime-bootstrap");

module.exports = {
  createJfsOutletContext,
  JfsOutletContextError,
  createOutletContextRegistry,
  globalRegistry,
  OutletRegistryError,
  createJfsHttpClient,
  assertExpectedNetworkCode,
  JfsNetworkMismatchError,
  bootstrapOutletContexts,
  parseContextDefinitionsFromEnv,
  ContextBootstrapError,
  resolveTrustedOutletContext,
  extractContextKeyFromHeaders,
  resolveContextFromRequest,
  ContextResolverError,
  CONTEXT_KEY_HEADER,
  CALLER_AUTH_HEADER,
  isMultiOutletEnabled,
  initializeMultiOutletRuntime
};
