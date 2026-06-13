const config = require("./config");

App({
  globalData: {
    backendMode: config.backendMode,
    apiBaseUrl: config.apiBaseUrl,
    allowInsecureServerApi: config.allowInsecureServerApi,
    apiTimeout: config.apiTimeout,
    serverOpenid: null,
    aiProvider: config.aiProvider,
    aiBaseUrl: config.aiBaseUrl,
    aiModel: config.aiModel,
    aiUseFreeRoute: config.aiUseFreeRoute,
    cloudEnv: config.cloudEnv,
    useMockBackend: config.backendMode === "mock",
    userStorageKey: `reading_buddy_user_${config.backendMode}`,
    user: null
  },

  onLaunch() {
    const mode = this.globalData.backendMode;

    if (mode === "cloud") {
      if (!wx.cloud) {
        console.warn("当前微信版本不支持云开发，回退到 mock 模式");
        this.globalData.useMockBackend = true;
        this.globalData.backendMode = "mock";
      } else {
        wx.cloud.init({
          env: this.globalData.cloudEnv,
          traceUser: true
        });
      }
    }

    // 恢复本地用户
    try {
      const saved = wx.getStorageSync(this.globalData.userStorageKey);
      if (saved) {
        this.globalData.user = saved;
      }
    } catch (e) {
      console.warn("读取本地用户失败", e);
    }
  },

  setUser(user) {
    this.globalData.user = user;
    try {
      wx.setStorageSync(this.globalData.userStorageKey, user);
    } catch (e) {
      console.warn("保存用户失败", e);
    }
  }
});
