/**
 * 读书搭子 - 首页（搭子 Tab）
 * 主仪表盘：展示统计、推荐、读书会、活动列表
 */
var display = require("../../utils/display");
var request = require("../../utils/request").request;
var ensureLogin = require("../../utils/request").ensureLogin;
var locationUtil = require("../../utils/location");
var privacy = require("../../utils/privacy");

// 构建筛选栏用的类型列表（前置"全部"）
var genreFilters = [{ value: "all", label: "全部" }].concat(display.GENRE_OPTIONS);

Page({
  data: {
    // 用户与位置
    user: null,
    city: "",
    district: "",
    profileCompletion: 0,
    locationEnabled: false,
    latitude: 0,
    longitude: 0,

    // 统计
    stats: {
      openActivities: 0,
      matchedCount: 0,
      pendingApplications: 0
    },

    // 读书会（意向池）
    intentPools: [],

    // 活动
    activities: [],
    filteredActivities: [],

    // 最佳匹配
    bestMatch: null,

    // AI 洞察
    aiInsight: null,

    // 画像提示
    profileTips: [],

    // 筛选
    selectedGenre: "all",
    genreFilters: genreFilters,

    // 状态
    loading: true
  },

  /* ---------- 生命周期 ---------- */

  onShow: function () {
    var that = this;
    ensureLogin().then(function (user) {
      that.setData({ user: user });
      that.loadDashboard();
    }).catch(function (err) {
      console.error("登录失败", err);
      wx.showToast({ title: "登录失败", icon: "none" });
    });
  },

  onPullDownRefresh: function () {
    var that = this;
    this.loadDashboard().then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  /* ---------- 数据加载 ---------- */

  loadDashboard: function () {
    var that = this;
    this.setData({ loading: true });

    return request("getDashboard", {
      latitude: that.data.latitude || undefined,
      longitude: that.data.longitude || undefined
    }).then(function (res) {
      if (!res.ok) {
        wx.showToast({ title: res.error || "加载失败", icon: "none" });
        that.setData({ loading: false });
        return;
      }

      var d = res.data || {};

      // 处理活动列表，附加显示字段
      var activities = (d.activities || []).map(function (act) {
        return that._enrichActivity(act);
      });

      // 处理最佳匹配
      var bestMatch = d.bestMatch ? that._enrichActivity(d.bestMatch) : null;

      // 处理读书会意向池
      var intentPools = (d.intentPools || []).map(function (pool) {
        return Object.assign({}, pool, {
          genreText: display.genreLabel(pool.genre),
          timeSlotText: display.slotLabel(pool.timeSlot),
          displayTime: pool.scheduledDate
            ? display.formatDate(pool.scheduledDate)
            : pool.timeSlotText || "时间待定"
        });
      });

      that.setData({
        stats: d.stats || that.data.stats,
        bestMatch: bestMatch,
        intentPools: intentPools,
        profileTips: d.profileTips || [],
        aiInsight: d.aiInsight || null,
        activities: activities,
        profileCompletion: d.profileCompletion || 0,
        city: d.city || that.data.city,
        district: d.district || that.data.district,
        loading: false
      });

      that._applyFilter();
    }).catch(function (err) {
      console.error("加载仪表盘失败", err);
      that.setData({ loading: false });
      wx.showToast({ title: "网络异常", icon: "none" });
    });
  },

  /* ---------- 筛选 ---------- */

  onFilterTap: function (e) {
    var genre = e.currentTarget.dataset.genre;
    this.setData({ selectedGenre: genre });
    this._applyFilter();
  },

  _applyFilter: function () {
    var genre = this.data.selectedGenre;
    var list = this.data.activities;
    if (!genre || genre === "all") {
      this.setData({ filteredActivities: list });
    } else {
      this.setData({
        filteredActivities: list.filter(function (a) {
          return a.genre === genre;
        })
      });
    }
  },

  /* ---------- 操作 ---------- */

  onApply: function (e) {
    var that = this;
    var activityId = e.currentTarget.dataset.id;
    privacy.ensurePrivacyAuthorization().then(function () {
      return request("applyActivity", { activityId: activityId });
    }).then(function (res) {
      if (res.ok) {
        wx.showToast({ title: "报名成功", icon: "success" });
        that.loadDashboard();
      } else {
        wx.showToast({ title: res.error || "报名失败", icon: "none" });
      }
    }).catch(function (err) {
      wx.showToast({ title: privacy.privacyErrorMessage(err), icon: "none" });
    });
  },

  onJoinIntent: function (e) {
    var that = this;
    var idx = e.currentTarget.dataset.index;
    var pool = this.data.intentPools[idx];
    if (!pool) return;

    privacy.ensurePrivacyAuthorization().then(function () {
      return request("createMatchIntent", {
        genre: pool.genre,
        city: pool.city,
        district: pool.district,
        timeSlot: pool.timeSlot,
        poolId: pool.id || pool._id
      });
    }).then(function (res) {
      if (res.ok) {
        wx.showToast({ title: "已加入读书会", icon: "success" });
        that.loadDashboard();
      } else {
        wx.showToast({ title: res.error || "加入失败", icon: "none" });
      }
    }).catch(function (err) {
      wx.showToast({ title: privacy.privacyErrorMessage(err), icon: "none" });
    });
  },

  onFeedback: function (e) {
    var that = this;
    var activityId = e.currentTarget.dataset.id;
    var feedbackType = e.currentTarget.dataset.type;
    request("recordRecommendationFeedback", {
      activityId: activityId,
      feedbackType: feedbackType
    }).then(function (res) {
      if (res.ok) {
        wx.showToast({
          title: feedbackType === "positive" ? "已标记感兴趣" : "已标记不感兴趣",
          icon: "none"
        });
        that.loadDashboard();
      } else {
        wx.showToast({ title: res.error || "操作失败", icon: "none" });
      }
    });
  },

  onUseCurrentLocation: function () {
    var that = this;
    locationUtil.getCurrentLocation().then(function (loc) {
      that.setData({
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationEnabled: true
      });
      wx.showToast({ title: "定位成功", icon: "success" });
      that.loadDashboard();
    }).catch(function (err) {
      wx.showToast({ title: err.message || "定位失败", icon: "none" });
    });
  },

  onSeedDemo: function () {
    var that = this;
    wx.showLoading({ title: "生成演示数据..." });
    request("seedDemoScenario", {}).then(function (res) {
      wx.hideLoading();
      if (res.ok) {
        wx.showToast({ title: "演示数据已生成", icon: "success" });
        that.loadDashboard();
      } else {
        wx.showToast({ title: res.error || "生成失败", icon: "none" });
      }
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: "生成失败", icon: "none" });
    });
  },

  /* ---------- 导航 ---------- */

  onGoProfile: function () {
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

  onGoMatchList: function () {
    wx.switchTab({ url: "/pages/match-list/match-list" });
  },

  onGoPostCreate: function () {
    wx.switchTab({ url: "/pages/post-create/post-create" });
  },

  onGoActivityDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/activity-detail/activity-detail?id=" + id });
  },

  /* ---------- 内部工具 ---------- */

  _enrichActivity: function (act) {
    var tags = display.buildActivityTags(act);
    var gradeClass = "grade-" + (act.aiGrade || "c").toLowerCase();
    var gradeLabel = (act.aiGrade || "C").toUpperCase();
    var timeText = display.formatDateTime(act.scheduledDate || act.startTime);
    var locationText = act.locationName
      || (act.city && act.district ? act.city + " " + act.district : "")
      || "地点待定";

    var distanceText = "";
    if (act.distance != null) {
      distanceText = locationUtil.formatDistance(act.distance);
    }

    return Object.assign({}, act, {
      tags: tags,
      gradeClass: gradeClass,
      gradeLabel: gradeLabel,
      timeText: timeText,
      locationText: locationText,
      distanceText: distanceText,
      genreText: display.genreLabel(act.genre)
    });
  }
});
