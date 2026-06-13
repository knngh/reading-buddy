/**
 * 读书搭子 - API 请求层
 * 支持 mock / server / cloud 三种模式
 */
var mockBackend = null;

function getMockBackend() {
  if (!mockBackend) {
    mockBackend = require("./mock-backend");
  }
  return mockBackend;
}

/**
 * 统一请求入口
 * @param {string} action - API 动作名
 * @param {object} data - 请求参数
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
function request(action, data) {
  var app = getApp();
  var mode = app.globalData.backendMode;

  if (mode === "mock") {
    return requestMock(action, data);
  } else if (mode === "server") {
    return requestServer(action, data);
  } else if (mode === "cloud") {
    return requestCloud(action, data);
  }
  return Promise.resolve({ ok: false, error: "未知的后端模式" });
}

function requestMock(action, data) {
  return new Promise(function (resolve) {
    try {
      var mb = getMockBackend();
      var result = mb.handle(action, data);
      resolve(result);
    } catch (e) {
      console.error("Mock 请求失败", action, e);
      resolve({ ok: false, error: e.message || "Mock 内部错误" });
    }
  });
}

function requestServer(action, data) {
  var app = getApp();
  var baseUrl = app.globalData.apiBaseUrl;
  var timeout = app.globalData.apiTimeout;
  var openid = app.globalData.serverOpenid;

  return new Promise(function (resolve) {
    wx.request({
      url: baseUrl + "/api",
      method: "POST",
      timeout: timeout,
      header: {
        "Content-Type": "application/json",
        "X-Reading-Buddy-Openid": openid || ""
      },
      data: { action: action, data: data || {} },
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          if (res.data.openid) {
            app.globalData.serverOpenid = res.data.openid;
          }
          resolve(res.data);
        } else {
          resolve({ ok: false, error: "HTTP " + res.statusCode });
        }
      },
      fail: function (err) {
        resolve({ ok: false, error: err.errMsg || "网络请求失败" });
      }
    });
  });
}

function requestCloud(action, data) {
  return new Promise(function (resolve) {
    wx.cloud.callFunction({
      name: "api",
      data: { action: action, data: data || {} },
      success: function (res) {
        resolve(res.result || { ok: false, error: "云函数无返回" });
      },
      fail: function (err) {
        resolve({ ok: false, error: err.errMsg || "云函数调用失败" });
      }
    });
  });
}

/**
 * 确保登录
 */
function ensureLogin() {
  var app = getApp();
  if (app.globalData.user) {
    return Promise.resolve(app.globalData.user);
  }
  return request("login", {}).then(function (res) {
    if (res.ok && res.data) {
      app.setUser(res.data);
      return res.data;
    }
    throw new Error(res.error || "登录失败");
  });
}

module.exports = {
  request: request,
  ensureLogin: ensureLogin
};
