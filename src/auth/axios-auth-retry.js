"use strict";

function installAxiosAuthRetry(axiosInstance, authManager) {
  return axiosInstance.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;
      if (
        error.response?.status !== 401 ||
        !config ||
        config.__jfsAuthRetried ||
        config.url?.includes("/basicdata/login") ||
        !authManager.hasCredentials()
      ) {
        throw error;
      }

      config.__jfsAuthRetried = true;
      const result = await authManager.refreshLogin();
      config.headers = config.headers || {};

      if ("Authtoken" in config.headers) {
        config.headers.Authtoken = result.token;
      }
      if ("authtoken" in config.headers) {
        config.headers.authtoken = result.token;
      }
      return axiosInstance(config);
    }
  );
}

module.exports = {
  installAxiosAuthRetry
};
