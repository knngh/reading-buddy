/**
 * 读书搭子 - 天地图 POI 搜索
 */

var TIANDITU_KEY = "YOUR_TIANDITU_KEY";

/**
 * 搜索地点
 * @param {string} keyword - 搜索关键词
 * @param {string} city - 城市
 * @param {number} page - 页码
 */
function searchPlaces(keyword, city, page) {
  var url = "https://api.tianditu.gov.cn/v2/search";
  var params = {
    keyWord: (city || "") + keyword,
    level: 12,
    mapBound: "-180,-90,180,90",
    queryType: 7,
    start: ((page || 1) - 1) * 10,
    count: 10,
    tk: TIANDITU_KEY
  };

  return new Promise(function (resolve) {
    wx.request({
      url: url,
      data: params,
      success: function (res) {
        if (res.data && res.data.pois) {
          var results = res.data.pois.map(function (poi) {
            var lonLat = (poi.lonlat || "").split(",");
            return {
              id: poi.poiId || poi.name,
              name: poi.name || "",
              address: poi.address || "",
              longitude: parseFloat(lonLat[0]) || 0,
              latitude: parseFloat(lonLat[1]) || 0,
              label: poi.name + (poi.address ? " (" + poi.address + ")" : "")
            };
          });
          resolve({ ok: true, data: results });
        } else {
          resolve({ ok: true, data: [] });
        }
      },
      fail: function () {
        resolve({ ok: false, error: "搜索失败" });
      }
    });
  });
}

module.exports = {
  searchPlaces: searchPlaces
};
