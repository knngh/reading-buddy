/**
 * 读书搭子 - 隐私授权工具
 */

/**
 * 确保隐私授权
 */
function ensurePrivacyAuthorization() {
  return new Promise(function (resolve, reject) {
    if (typeof wx.getPrivacySetting !== "function") {
      resolve();
      return;
    }
    wx.getPrivacySetting({
      success: function (res) {
        if (res.needAuthorization) {
          wx.navigateTo({
            url: "/pages/privacy/privacy",
            success: function () { resolve(); },
            fail: function () { reject(new Error("需要隐私授权")); }
          });
        } else {
          resolve();
        }
      },
      fail: function () {
        resolve();
      }
    });
  });
}

/**
 * 打开隐私协议
 */
function openPrivacyContract() {
  if (typeof wx.openPrivacyContract === "function") {
    wx.openPrivacyContract({
      fail: function () {
        wx.showToast({ title: "打开失败", icon: "none" });
      }
    });
  }
}

/**
 * 隐私错误提示
 */
function privacyErrorMessage(err) {
  var msg = (err && err.message) || "";
  if (msg.indexOf("privacy") >= 0 || msg.indexOf("隐私") >= 0) {
    return "请先完成隐私授权";
  }
  return msg || "操作失败";
}

module.exports = {
  ensurePrivacyAuthorization: ensurePrivacyAuthorization,
  openPrivacyContract: openPrivacyContract,
  privacyErrorMessage: privacyErrorMessage
};
