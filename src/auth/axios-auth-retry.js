"use strict";

function installAxiosAuthRetry(axiosInstance, authManager) {
  return axiosInstance.interceptors.response.use(
    async response => {
      const code = response?.data?.code;
      const config = response?.config;

      if (
        (code === 405 || code === 401 || code === 403) &&
        config &&
        !config.__jfsAuthRetried &&
        !config.url?.includes("/basicdata/login") &&
        authManager &&
        typeof authManager.hasCredentials === "function" &&
        authManager.hasCredentials()
      ) {
        config.__jfsAuthRetried = true;
        const result = await authManager.refreshLogin();
        config.headers = config.headers || {};
        if (result?.token) {
          config.headers.Authtoken = result.token;
          config.headers.authtoken = result.token;
        }
        return axiosInstance(config);
      }
      return response;
    },
    async error => {
      const config = error.config;
      if (
        error.response?.status !== 401 ||
        !config ||
        config.__jfsAuthRetried ||
        config.url?.includes("/basicdata/login") ||
        !authManager ||
        typeof authManager.hasCredentials !== "function" ||
        !authManager.hasCredentials()
      ) {
        throw error;
      }

      config.__jfsAuthRetried = true;
      const result = await authManager.refreshLogin();
      config.headers = config.headers || {};

      if (result?.token) {
        if ("Authtoken" in config.headers || !config.headers.authtoken) {
          config.headers.Authtoken = result.token;
        }
        if ("authtoken" in config.headers || !config.headers.Authtoken) {
          config.headers.authtoken = result.token;
        }
      }
      return axiosInstance(config);
    }
  );
}

module.exports = {
  installAxiosAuthRetry
};
