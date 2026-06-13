var display = require("../../utils/display");
var request = require("../../utils/request").request;
var locationUtil = require("../../utils/location");

Page({
  data: {
    activities: [],
    filters: {
      city: "",
      district: "",
      genre: "",
      readingLevel: "",
      timeSlot: ""
    },
    filterCount: 0,
    locationEnabled: false,
    latitude: 0,
    longitude: 0,
    loading: false,

    // 选项列表
    GENRE_OPTIONS: [],
    LEVEL_OPTIONS: [],
    SLOT_OPTIONS: [],
    CITY_OPTIONS: [],
    districts: [],

    // picker 用的纯 label / 纯字符串数组
    genreLabels: [],
    levelLabels: [],
    slotLabels: [],

    // picker 当前选中索引
    cityIndex: 0,
    districtIndex: 0,
    genreIndex: 0,
    levelIndex: 0,
    slotIndex: 0
  },

  onLoad: function () {
    var that = this;
    var genreLabels = display.GENRE_OPTIONS.map(function (o) { return o.label; });
    var levelLabels = display.LEVEL_OPTIONS.map(function (o) { return o.label; });
    var slotLabels = display.SLOT_OPTIONS.map(function (o) { return o.label; });

    that.setData({
      GENRE_OPTIONS: display.GENRE_OPTIONS,
      LEVEL_OPTIONS: display.LEVEL_OPTIONS,
      SLOT_OPTIONS: display.SLOT_OPTIONS,
      CITY_OPTIONS: display.CITY_OPTIONS,
      genreLabels: genreLabels,
      levelLabels: levelLabels,
      slotLabels: slotLabels
    });

    // 从用户资料自动设置城市和区县
    var app = getApp();
    var user = app.globalData.user;
    if (user && user.city) {
      var cityIdx = display.CITY_OPTIONS.indexOf(user.city);
      var districts = display.CITY_DATA[user.city] || [];
      that.setData({
        "filters.city": user.city,
        districts: districts,
        cityIndex: cityIdx >= 0 ? cityIdx : 0
      });
      if (user.district) {
        var distIdx = districts.indexOf(user.district);
        that.setData({
          "filters.district": user.district,
          districtIndex: distIdx >= 0 ? distIdx : 0
        });
      }
    }

    that._recalcFilterCount();
    that.loadList();
  },

  loadList: function () {
    var that = this;
    that.setData({ loading: true });

    var params = {
      filters: that.data.filters,
      latitude: that.data.latitude,
      longitude: that.data.longitude
    };

    request("recommendations", params).then(function (res) {
      if (res.ok && res.data) {
        var list = res.data.map(function (item) {
          item.tags = display.buildActivityTags(item);
          item.timeText = display.formatDateTime(item.startAt);
          item.statusText = display.statusLabel(item.status);
          return item;
        });
        that.setData({ activities: list, loading: false });
      } else {
        wx.showToast({ title: res.error || "加载失败", icon: "none" });
        that.setData({ loading: false });
      }
    });
  },

  _findIndex: function (arr, value, key) {
    if (!value) return 0;
    for (var i = 0; i < arr.length; i++) {
      if (key ? arr[i][key] === value : arr[i] === value) return i;
    }
    return 0;
  },

  _recalcFilterCount: function () {
    var filters = this.data.filters;
    var count = 0;
    var keys = Object.keys(filters);
    for (var i = 0; i < keys.length; i++) {
      if (filters[keys[i]]) count++;
    }
    this.setData({ filterCount: count });
  },

  onCityChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var city = this.data.CITY_OPTIONS[idx] || "";
    var filters = this.data.filters;
    filters.city = city;
    filters.district = "";

    var districts = city ? (display.CITY_DATA[city] || []) : [];
    this.setData({
      filters: filters,
      districts: districts,
      cityIndex: idx,
      districtIndex: 0
    });
    this._recalcFilterCount();
    this.loadList();
  },

  onDistrictChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var district = this.data.districts[idx] || "";
    var filters = this.data.filters;
    filters.district = district;
    this.setData({ filters: filters, districtIndex: idx });
    this._recalcFilterCount();
    this.loadList();
  },

  onGenreChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.GENRE_OPTIONS[idx] ? this.data.GENRE_OPTIONS[idx].value : "";
    var filters = this.data.filters;
    filters.genre = value;
    this.setData({ filters: filters, genreIndex: idx });
    this._recalcFilterCount();
    this.loadList();
  },

  onLevelChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.LEVEL_OPTIONS[idx] ? this.data.LEVEL_OPTIONS[idx].value : "";
    var filters = this.data.filters;
    filters.readingLevel = value;
    this.setData({ filters: filters, levelIndex: idx });
    this._recalcFilterCount();
    this.loadList();
  },

  onSlotChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.SLOT_OPTIONS[idx] ? this.data.SLOT_OPTIONS[idx].value : "";
    var filters = this.data.filters;
    filters.timeSlot = value;
    this.setData({ filters: filters, slotIndex: idx });
    this._recalcFilterCount();
    this.loadList();
  },

  onResetFilters: function () {
    this.setData({
      filters: {
        city: "",
        district: "",
        genre: "",
        readingLevel: "",
        timeSlot: ""
      },
      filterCount: 0,
      districts: [],
      cityIndex: 0,
      districtIndex: 0,
      genreIndex: 0,
      levelIndex: 0,
      slotIndex: 0
    });
    this.loadList();
  },

  onUseCurrentLocation: function () {
    var that = this;
    wx.showLoading({ title: "获取位置..." });
    locationUtil.getCurrentLocation().then(function (loc) {
      wx.hideLoading();
      that.setData({
        locationEnabled: true,
        latitude: loc.latitude,
        longitude: loc.longitude
      });
      wx.showToast({ title: "已启用定位", icon: "success" });
      that.loadList();
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || "获取位置失败", icon: "none" });
    });
  },

  onFeedback: function (e) {
    var that = this;
    var activityId = e.currentTarget.dataset.id;
    var type = e.currentTarget.dataset.type;

    request("recordRecommendationFeedback", {
      activityId: activityId,
      feedbackType: type
    }).then(function (res) {
      if (res.ok) {
        if (type === "hide") {
          var list = that.data.activities.filter(function (a) {
            return a.id !== activityId;
          });
          that.setData({ activities: list });
          wx.showToast({ title: "已隐藏", icon: "success" });
        } else {
          wx.showToast({ title: "已记录反馈", icon: "success" });
        }
      }
    });
  },

  onApply: function (e) {
    var that = this;
    var activityId = e.currentTarget.dataset.id;

    request("applyActivity", { activityId: activityId }).then(function (res) {
      if (res.ok) {
        wx.showToast({ title: "报名成功", icon: "success" });
        that.loadList();
      } else {
        wx.showToast({ title: res.error || "报名失败", icon: "none" });
      }
    });
  },

  onDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/activity-detail/activity-detail?id=" + id });
  },

  onPullDownRefresh: function () {
    this.loadList();
    wx.stopPullDownRefresh();
  }
});
