var display = require("../../utils/display");
var request = require("../../utils/request").request;
var locationUtil = require("../../utils/location");
var tianditu = require("../../utils/tianditu");

Page({
  data: {
    form: {
      title: "",
      genre: "",
      readingLevel: "",
      city: "",
      district: "",
      locationName: "",
      locationAddress: "",
      latitude: 0,
      longitude: 0,
      date: "",
      time: "",
      maxParticipants: 6,
      bookMode: "",
      format: "",
      description: "",
      discussionTopic: ""
    },

    // 选项数组（对象）
    genreOptions: [],
    levelOptions: [],
    bookModeOptions: [],
    formatOptions: [],
    cityOptions: [],
    districtOptions: [],

    // picker 用的纯 label 数组
    genreLabels: [],
    levelLabels: [],
    bookModeLabels: [],
    formatLabels: [],

    // picker 当前选中索引
    genreIndex: 0,
    levelIndex: 0,
    bookModeIndex: 0,
    formatIndex: 0,
    cityIndex: 0,
    districtIndex: 0,
    participantIndex: 4,

    // 日期范围
    dateRange: {
      start: "",
      end: ""
    },

    // 参与人数范围
    participantRange: [],
    participantLabels: [],

    // 状态
    submitting: false,
    aiGenerating: false,

    // POI 搜索
    placeResults: [],
    placeKeyword: "",
    searchingPlace: false
  },

  onLoad: function () {
    var genreLabels = display.GENRE_OPTIONS.map(function (o) { return o.label; });
    var levelLabels = display.LEVEL_OPTIONS.map(function (o) { return o.label; });
    var bookModeLabels = display.BOOK_MODE_OPTIONS.map(function (o) { return o.label; });
    var formatLabels = display.FORMAT_OPTIONS.map(function (o) { return o.label; });

    // 参与人数 2-20
    var participantRange = [];
    var participantLabels = [];
    for (var i = 2; i <= 20; i++) {
      participantRange.push(i);
      participantLabels.push(i + " 人");
    }

    // 日期范围：今天 ~ 6 个月后
    var today = new Date();
    var future = new Date();
    future.setMonth(future.getMonth() + 6);
    var startDate = display.formatDate(today);
    var endDate = display.formatDate(future);

    this.setData({
      genreOptions: display.GENRE_OPTIONS,
      levelOptions: display.LEVEL_OPTIONS,
      bookModeOptions: display.BOOK_MODE_OPTIONS,
      formatOptions: display.FORMAT_OPTIONS,
      cityOptions: display.CITY_OPTIONS,
      genreLabels: genreLabels,
      levelLabels: levelLabels,
      bookModeLabels: bookModeLabels,
      formatLabels: formatLabels,
      participantRange: participantRange,
      participantLabels: participantLabels,
      dateRange: { start: startDate, end: endDate }
    });
  },

  // ---------- 文本输入 ----------
  onInputChange: function (e) {
    var field = e.currentTarget.dataset.field;
    var value = e.detail.value;
    this.setData({ ["form." + field]: value });
  },

  // ---------- Picker 事件 ----------
  onGenreChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.genreOptions[idx] ? this.data.genreOptions[idx].value : "";
    this.setData({ "form.genre": value, genreIndex: idx });
  },

  onLevelChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.levelOptions[idx] ? this.data.levelOptions[idx].value : "";
    this.setData({ "form.readingLevel": value, levelIndex: idx });
  },

  onBookModeChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.bookModeOptions[idx] ? this.data.bookModeOptions[idx].value : "";
    this.setData({ "form.bookMode": value, bookModeIndex: idx });
  },

  onFormatChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.formatOptions[idx] ? this.data.formatOptions[idx].value : "";
    this.setData({ "form.format": value, formatIndex: idx });
  },

  onCityChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var city = this.data.cityOptions[idx] || "";
    var districtOptions = city ? (display.CITY_DATA[city] || []) : [];
    this.setData({
      "form.city": city,
      "form.district": "",
      cityIndex: idx,
      districtOptions: districtOptions,
      districtIndex: 0
    });
  },

  onDistrictChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var district = this.data.districtOptions[idx] || "";
    this.setData({ "form.district": district, districtIndex: idx });
  },

  onDateChange: function (e) {
    this.setData({ "form.date": e.detail.value });
  },

  onTimeChange: function (e) {
    this.setData({ "form.time": e.detail.value });
  },

  onParticipantsChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var value = this.data.participantRange[idx] || 6;
    this.setData({ "form.maxParticipants": value, participantIndex: idx });
  },

  // ---------- POI 地点搜索 ----------
  onPlaceKeywordInput: function (e) {
    this.setData({ placeKeyword: e.detail.value });
  },

  onSearchPlace: function () {
    var that = this;
    var keyword = that.data.placeKeyword;
    if (!keyword) {
      wx.showToast({ title: "请输入搜索关键词", icon: "none" });
      return;
    }

    that.setData({ searchingPlace: true, placeResults: [] });

    tianditu.searchPlaces(keyword, that.data.form.city).then(function (res) {
      if (res.ok && res.data) {
        that.setData({ placeResults: res.data, searchingPlace: false });
      } else {
        that.setData({ searchingPlace: false });
        wx.showToast({ title: res.error || "搜索失败", icon: "none" });
      }
    });
  },

  onSelectPlace: function (e) {
    var idx = e.currentTarget.dataset.index;
    var place = this.data.placeResults[idx];
    if (!place) return;

    this.setData({
      "form.locationName": place.name,
      "form.locationAddress": place.address,
      "form.latitude": place.latitude,
      "form.longitude": place.longitude,
      placeResults: []
    });

    wx.showToast({ title: "已选择 " + place.name, icon: "success" });
  },

  // ---------- AI 生成 ----------
  onAiGenerate: function () {
    var that = this;
    var form = that.data.form;

    if (!form.genre) {
      wx.showToast({ title: "请先选择书籍类型", icon: "none" });
      return;
    }

    that.setData({ aiGenerating: true });

    request("aiAssist", {
      task: "activity_draft",
      form: {
        genre: form.genre,
        genreLabel: display.genreLabel(form.genre),
        city: form.city,
        format: form.format,
        readingLevel: form.readingLevel
      }
    }).then(function (res) {
      that.setData({ aiGenerating: false });
      if (res.ok && res.data) {
        var updates = {};
        if (res.data.title) updates["form.title"] = res.data.title;
        if (res.data.description) updates["form.description"] = res.data.description;
        if (res.data.discussionTopic) updates["form.discussionTopic"] = res.data.discussionTopic;
        that.setData(updates);
        wx.showToast({ title: "AI 已生成内容", icon: "success" });
      } else {
        wx.showToast({ title: res.error || "AI 生成失败", icon: "none" });
      }
    }).catch(function () {
      that.setData({ aiGenerating: false });
      wx.showToast({ title: "AI 生成失败", icon: "none" });
    });
  },

  // ---------- 表单验证 ----------
  validate: function () {
    var form = this.data.form;

    if (!form.title || !form.title.trim()) {
      wx.showToast({ title: "请输入活动标题", icon: "none" });
      return false;
    }
    if (!form.genre) {
      wx.showToast({ title: "请选择书籍类型", icon: "none" });
      return false;
    }
    if (!form.readingLevel) {
      wx.showToast({ title: "请选择阅读水平", icon: "none" });
      return false;
    }
    if (!form.city) {
      wx.showToast({ title: "请选择城市", icon: "none" });
      return false;
    }
    if (!form.format) {
      wx.showToast({ title: "请选择活动形式", icon: "none" });
      return false;
    }
    if (!form.date) {
      wx.showToast({ title: "请选择活动日期", icon: "none" });
      return false;
    }
    if (!form.time) {
      wx.showToast({ title: "请选择活动时间", icon: "none" });
      return false;
    }
    if (form.maxParticipants < 2 || form.maxParticipants > 20) {
      wx.showToast({ title: "参与人数需在 2-20 之间", icon: "none" });
      return false;
    }
    if (!form.bookMode) {
      wx.showToast({ title: "请选择书籍获取方式", icon: "none" });
      return false;
    }
    if (!form.description || !form.description.trim()) {
      wx.showToast({ title: "请输入活动描述", icon: "none" });
      return false;
    }

    // 线下活动需要地点信息
    if (form.format === "offline" || form.format === "hybrid") {
      if (!form.locationName) {
        wx.showToast({ title: "请选择活动地点", icon: "none" });
        return false;
      }
      if (!form.latitude || !form.longitude) {
        wx.showToast({ title: "请通过搜索选择地点坐标", icon: "none" });
        return false;
      }
    }

    // 检查是否为未来时间
    var startAt = new Date(form.date + "T" + form.time + ":00");
    if (startAt.getTime() <= Date.now()) {
      wx.showToast({ title: "活动时间需晚于当前时间", icon: "none" });
      return false;
    }

    return true;
  },

  // ---------- 提交 ----------
  onSubmit: function () {
    var that = this;

    if (!that.validate()) return;

    that.setData({ submitting: true });

    var form = that.data.form;
    var startAt = new Date(form.date + "T" + form.time + ":00").toISOString();

    var payload = {
      title: form.title.trim(),
      genre: form.genre,
      readingLevel: form.readingLevel,
      city: form.city,
      district: form.district,
      locationName: form.locationName,
      locationAddress: form.locationAddress,
      latitude: form.latitude,
      longitude: form.longitude,
      date: form.date,
      time: form.time,
      startAt: startAt,
      maxParticipants: form.maxParticipants,
      bookMode: form.bookMode,
      format: form.format,
      description: form.description.trim(),
      discussionTopic: form.discussionTopic.trim()
    };

    request("createActivity", payload).then(function (res) {
      that.setData({ submitting: false });
      if (res.ok && res.data) {
        wx.showToast({ title: "发布成功", icon: "success" });
        setTimeout(function () {
          wx.redirectTo({
            url: "/pages/activity-detail/activity-detail?id=" + res.data.id
          });
        }, 1500);
      } else {
        wx.showToast({ title: res.error || "发布失败", icon: "none" });
      }
    }).catch(function () {
      that.setData({ submitting: false });
      wx.showToast({ title: "发布失败", icon: "none" });
    });
  }
});
