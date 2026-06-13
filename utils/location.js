/**
 * 读书搭子 - 地理位置工具
 */

var LOCATION_KEY = "reading_buddy_location";

/**
 * 获取当前 GPS 位置
 */
function getCurrentLocation() {
  return new Promise(function (resolve, reject) {
    wx.getLocation({
      type: "gcj02",
      success: function (res) {
        var loc = {
          latitude: res.latitude,
          longitude: res.longitude,
          accuracy: res.accuracy || 0,
          updatedAt: new Date().toISOString()
        };
        try {
          wx.setStorageSync(LOCATION_KEY, loc);
        } catch (e) { /* ignore */ }
        resolve(loc);
      },
      fail: function (err) {
        var msg = err.errMsg || "";
        if (msg.indexOf("auth deny") >= 0 || msg.indexOf("authorize") >= 0) {
          reject(new Error("请在设置中开启位置权限"));
        } else {
          reject(new Error("获取位置失败"));
        }
      }
    });
  });
}

/**
 * 读取缓存位置
 */
function getCachedLocation() {
  try {
    return wx.getStorageSync(LOCATION_KEY) || null;
  } catch (e) {
    return null;
  }
}

/**
 * 计算两点间距离（米）
 */
function getDistance(lat1, lng1, lat2, lng2) {
  var rad = Math.PI / 180;
  var R = 6371000;
  var dLat = (lat2 - lat1) * rad;
  var dLng = (lng2 - lng1) * rad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 格式化距离
 */
function formatDistance(meters) {
  if (meters == null || isNaN(meters)) return "";
  if (meters < 1000) return Math.round(meters) + "m";
  if (meters < 10000) return (meters / 1000).toFixed(1) + "km";
  return Math.round(meters / 1000) + "km";
}

module.exports = {
  getCurrentLocation: getCurrentLocation,
  getCachedLocation: getCachedLocation,
  getDistance: getDistance,
  formatDistance: formatDistance
};
