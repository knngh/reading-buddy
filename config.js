/**
 * 读书搭子 - 全局配置
 * backendMode: "mock" | "server" | "cloud"
 */
module.exports = {
  backendMode: "mock",

  // HTTP API 地址（server 模式）
  apiBaseUrl: process.env.API_BASE_URL || "",
  allowInsecureServerApi: false,
  apiTimeout: 12000,

  // AI 配置
  aiProvider: "deepseek",
  aiBaseUrl: "https://api.deepseek.com",
  aiModel: "deepseek-v4-flash",
  aiUseFreeRoute: true,

  // 云开发环境（cloud 模式）
  cloudEnv: ""
};
