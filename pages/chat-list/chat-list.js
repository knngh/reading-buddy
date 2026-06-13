var display = require("../../utils/display");
var request = require("../../utils/request").request;
var locationUtil = require("../../utils/location");
var sharePoster = require("../../utils/share-poster");

var statusMap = {
  open: "报名中",
  full: "已满员",
  matched: "已匹配",
  confirmed: "已确认",
  completed: "已完成",
  cancelled: "已取消"
};

var genreMap = {
  literature: "文学小说",
  business: "商业管理",
  tech: "科技互联网",
  history: "历史人文",
  psychology: "心理学",
  philosophy: "哲学思想",
  self_help: "自我提升",
  art: "艺术设计",
  scifi: "科幻悬疑",
  biography: "人物传记",
  education: "教育学习"
};

var levelMap = {
  beginner: "入门读者",
  intermediate: "进阶读者",
  advanced: "资深读者",
  all: "不限水平"
};

var appStatusMap = {
  pending: "待审核",
  accepted: "已接受",
  rejected: "已拒绝",
  withdrawn: "已撤回"
};

var funnelStages = [
  { key: "created", label: "已创建", color: "#6C63FF" },
  { key: "open", label: "报名中", color: "#00C48C" },
  { key: "applications", label: "有报名", color: "#FF9500" },
  { key: "matched", label: "已匹配", color: "#007AFF" },
  { key: "completed", label: "已完成", color: "#8E8E93" }
];

var coldStartStages = [
  { key: "seed", label: "种子期", desc: "首批用户引入" },
  { key: "activate", label: "激活期", desc: "首次活动发起" },
  { key: "convert", label: "转化期", desc: "稳定共读形成" },
  { key: "scale", label: "规模期", desc: "自增长运转" }
];

Page({
  data: {
    currentTab: 0,
    tabs: ["待办", "我的报名", "我发起的"],
    opsQueue: [],
    opsFunnel: null,
    funnelStages: funnelStages,
    coldStartStages: coldStartStages,
    cityOpsSummary: null,
    myApplications: [],
    myCreated: [],
    stats: {
      highRisk: 0,
      applications: 0,
      reports: 0,
      reviews: 0
    },
    loading: true,
    statusMap: statusMap,
    genreMap: genreMap,
    levelMap: levelMap,
    appStatusMap: appStatusMap
  },

  onShow: function () {
    this.loadAll();
  },

  loadAll: function () {
    var that = this;
    that.setData({ loading: true });
    Promise.all([
      that.loadOpsQueue(),
      that.loadOpsFunnel(),
      that.loadMyApplications(),
      that.loadMyCreated()
    ]).then(function () {
      that.setData({ loading: false });
    }).catch(function () {
      that.setData({ loading: false });
    });
  },

  switchTab: function (e) {
    var tab = parseInt(e.currentTarget.dataset.tab, 10);
    this.setData({ currentTab: tab });
  },

  loadOpsQueue: function () {
    var that = this;
    return request("getOpsQueue", {}).then(function (res) {
      var queue = res.queue || [];
      var cityOpsSummary = res.cityOpsSummary || null;
      var stats = res.stats || { highRisk: 0, applications: 0, reports: 0, reviews: 0 };

      queue.forEach(function (item) {
        item.timeFormatted = item.time ? display.formatTime(item.time) : "";
        if (item.activity && item.activity.genre) {
          item.activity.genreLabel = genreMap[item.activity.genre] || item.activity.genre;
        }
        if (item.activity && item.activity.level) {
          item.activity.levelLabel = levelMap[item.activity.level] || item.activity.level;
        }
      });

      that.setData({
        opsQueue: queue,
        cityOpsSummary: cityOpsSummary,
        stats: stats
      });
    }).catch(function () {
      that.setData({ opsQueue: [] });
    });
  },

  loadOpsFunnel: function () {
    var that = this;
    return request("getOpsFunnel", {}).then(function (res) {
      var funnel = res.funnel || {};
      var stages = funnelStages.map(function (s) {
        return {
          key: s.key,
          label: s.label,
          color: s.color,
          count: funnel[s.key] || 0
        };
      });
      var maxCount = 1;
      stages.forEach(function (s) {
        if (s.count > maxCount) maxCount = s.count;
      });
      stages.forEach(function (s) {
        s.percent = Math.round((s.count / maxCount) * 100);
      });
      that.setData({ opsFunnel: stages });
    }).catch(function () {
      that.setData({ opsFunnel: null });
    });
  },

  loadMyApplications: function () {
    var that = this;
    return request("getMyApplications", {}).then(function (res) {
      var apps = res.applications || [];
      apps.forEach(function (app) {
        app.statusLabel = appStatusMap[app.status] || app.status;
        if (app.activity) {
          app.activity.statusLabel = statusMap[app.activity.status] || app.activity.status;
          app.activity.timeFormatted = app.activity.time ? display.formatTime(app.activity.time) : "";
          app.activity.genreLabel = genreMap[app.activity.genre] || app.activity.genre || "";
        }
      });
      that.setData({ myApplications: apps });
    }).catch(function () {
      that.setData({ myApplications: [] });
    });
  },

  loadMyCreated: function () {
    var that = this;
    return request("getMyCreated", {}).then(function (res) {
      var created = res.activities || [];
      created.forEach(function (act) {
        act.statusLabel = statusMap[act.status] || act.status;
        act.timeFormatted = act.time ? display.formatTime(act.time) : "";
        act.genreLabel = genreMap[act.genre] || act.genre || "";
        act.applicantList = act.applicants || [];
        act.applicantList.forEach(function (app) {
          app.statusLabel = appStatusMap[app.status] || app.status;
          app.levelLabel = levelMap[app.level] || app.level || "";
        });
        act.pendingCount = act.applicantList.filter(function (a) { return a.status === "pending"; }).length;
        act.acceptedCount = act.applicantList.filter(function (a) { return a.status === "accepted"; }).length;
        act.rejectedCount = act.applicantList.filter(function (a) { return a.status === "rejected"; }).length;
      });
      that.setData({ myCreated: created });
    }).catch(function () {
      that.setData({ myCreated: [] });
    });
  },

  onReviewFromList: function (e) {
    var that = this;
    var dataset = e.currentTarget.dataset;
    var activityId = dataset.activityid;
    var applicantOpenid = dataset.openid;
    var decision = dataset.decision;

    request("reviewApplication", {
      activityId: activityId,
      applicantOpenid: applicantOpenid,
      decision: decision
    }).then(function () {
      display.toast(decision === "accept" ? "已接受" : "已拒绝");
      that.loadMyCreated();
    }).catch(function (err) {
      display.toast(err.message || "操作失败");
    });
  },

  onDetail: function (e) {
    var activityId = e.currentTarget.dataset.id;
    if (activityId) {
      wx.navigateTo({
        url: "/pages/activity-detail/activity-detail?id=" + activityId
      });
    }
  },

  onResolveReport: function (e) {
    var that = this;
    var reportId = e.currentTarget.dataset.reportid;
    var action = e.currentTarget.dataset.action;

    request("resolveReport", { reportId: reportId, action: action }).then(function () {
      display.toast("已处理");
      that.loadOpsQueue();
    }).catch(function (err) {
      display.toast(err.message || "处理失败");
    });
  },

  onResolveActivity: function (e) {
    var that = this;
    var activityId = e.currentTarget.dataset.activityid;
    var action = e.currentTarget.dataset.action;

    request("resolveActivityReview", { activityId: activityId, action: action }).then(function () {
      display.toast("已处理");
      that.loadOpsQueue();
    }).catch(function (err) {
      display.toast(err.message || "处理失败");
    });
  }
});
