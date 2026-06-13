Page({
  data: {
    agreed: false
  },

  onLoad: function () {},

  onAgree: function () {
    // Use the button's agreePrivacyAuthorization open-type
    wx.showToast({ title: "授权成功", icon: "success" });
    setTimeout(function () {
      wx.navigateBack();
    }, 1000);
  },

  onOpenContract: function () {
    var privacy = require("../../utils/privacy");
    privacy.openPrivacyContract();
  }
});
