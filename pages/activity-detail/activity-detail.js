var display = require("../../utils/display");
var request = require("../../utils/request").request;
var locationUtil = require("../../utils/location");
var sharePoster = require("../../utils/share-poster");

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

var bookModeMap = {
  bring_own: "自带书籍",
  shared: "共享书籍",
  aa_buy: "AA购买"
};

var formatMap = {
  offline: "线下共读",
  online: "线上共读",
  hybrid: "线上+线下"
};

var statusMap = {
  open: "报名中",
  full: "已满员",
  matched: "已匹配",
  confirmed: "已确认",
  completed: "已完成",
  cancelled: "已取消"
};

var withdrawReasons = [
  { value: "schedule_conflict", label: "时间冲突" },
  { value: "finished_book", label: "已读完该书" },
  { value: "location_inconvenient", label: "地点不便" },
  { value: "found_other", label: "找到其他活动" },
  { value: "personal", label: "个人原因" }
];

Page({
  data: {
    activityId: "",
    activity: null,
    poster: null,
    isCreator: false,
    myApplication: null,
    applicants: [],
    shareCount: 0,
    showReviewForm: false,
    reviewForm: {
      relativeScore: 100,
      punctuality: 80,
      focus: 80,
      discussion: 80,
      preparation: 80,
      comment: ""
    },
    showReportForm: false,
    reportForm: {
      reason: "",
      description: ""
    },
    withdrawReasons: withdrawReasons,
    showWithdrawDialog: false,
    selectedWithdrawReason: "",
    statusMap: statusMap,
    genreMap: genreMap,
    levelMap: levelMap,
    bookModeMap: bookModeMap,
    formatMap: formatMap,
    reportReasons: [
      { value: "spam", label: "垃圾信息" },
      { value: "inappropriate", label: "不当内容" },
      { value: "noshow", label: "爽约未到场" },
      { value: "other", label: "其他原因" }
    ],
    selectedReportReason: -1
  },

  onLoad: function (options) {
    var activityId = options.id || "";
    this.setData({ activityId: activityId });
    this.loadDetail();
  },

  loadDetail: function () {
    var that = this;
    var activityId = that.data.activityId;
    if (!activityId) return;

    request("getActivityDetail", { activityId: activityId }).then(function (res) {
      var activity = res.activity || {};
      var myApplication = res.myApplication || null;
      var applicants = res.applicants || [];
      var shareCount = res.shareCount || 0;
      var isCreator = res.isCreator || false;

      activity.genreLabel = genreMap[activity.genre] || activity.genre || "";
      activity.levelLabel = levelMap[activity.level] || activity.level || "";
      activity.bookModeLabel = bookModeMap[activity.bookMode] || activity.bookMode || "";
      activity.formatLabel = formatMap[activity.format] || activity.format || "";
      activity.statusLabel = statusMap[activity.status] || activity.status || "";

      if (activity.time) {
        activity.timeFormatted = display.formatTime(activity.time);
      }
      if (activity.location && activity.location.name) {
        activity.locationName = activity.location.name;
      }
      if (activity.distance != null) {
        activity.distanceText = display.formatDistance(activity.distance);
      }

      var spotsLeft = (activity.maxParticipants || 0) - (activity.participants || 0);
      activity.spotsLeft = spotsLeft > 0 ? spotsLeft : 0;
      activity.readinessPercent = activity.readinessPercent || 0;

      applicants.forEach(function (app) {
        app.levelLabel = levelMap[app.level] || app.level || "";
      });

      var poster = null;
      try {
        poster = sharePoster.buildActivityPoster(activity);
      } catch (e) {
        poster = null;
      }

      var showReviewForm = false;
      if (activity.status === "completed" && !res.hasReviewed) {
        showReviewForm = true;
      }

      that.setData({
        activity: activity,
        myApplication: myApplication,
        applicants: applicants,
        shareCount: shareCount,
        isCreator: isCreator,
        poster: poster,
        showReviewForm: showReviewForm
      });
    }).catch(function (err) {
      display.toast("加载失败");
    });
  },

  onApply: function () {
    var that = this;
    var activityId = that.data.activityId;
    request("applyActivity", { activityId: activityId, message: "" }).then(function () {
      display.toast("报名成功");
      that.loadDetail();
    }).catch(function (err) {
      display.toast(err.message || "报名失败");
    });
  },

  onConfirmAttendance: function () {
    var that = this;
    var activityId = that.data.activityId;
    request("confirmAttendance", { activityId: activityId }).then(function () {
      display.toast("已确认出席");
      that.loadDetail();
    }).catch(function (err) {
      display.toast(err.message || "确认失败");
    });
  },

  onWithdrawApplication: function () {
    var that = this;
    that.setData({ showWithdrawDialog: true, selectedWithdrawReason: "" });
  },

  onSelectWithdrawReason: function (e) {
    var value = e.currentTarget.dataset.value;
    this.setData({ selectedWithdrawReason: value });
  },

  onConfirmWithdraw: function () {
    var that = this;
    var reason = that.data.selectedWithdrawReason;
    if (!reason) {
      display.toast("请选择撤回原因");
      return;
    }
    var activityId = that.data.activityId;
    request("withdrawApplication", { activityId: activityId, reason: reason }).then(function () {
      display.toast("已撤回报名");
      that.setData({ showWithdrawDialog: false });
      that.loadDetail();
    }).catch(function (err) {
      display.toast(err.message || "撤回失败");
    });
  },

  onCloseWithdrawDialog: function () {
    this.setData({ showWithdrawDialog: false });
  },

  onCancelActivity: function () {
    var that = this;
    wx.showModal({
      title: "取消活动",
      content: "确定要取消此活动吗？取消后不可恢复。",
      editable: true,
      placeholderText: "请输入取消原因（选填）",
      success: function (res) {
        if (res.confirm) {
          var reason = res.content || "发起人取消";
          var activityId = that.data.activityId;
          request("cancelActivity", { activityId: activityId, reason: reason }).then(function () {
            display.toast("活动已取消");
            wx.navigateBack();
          }).catch(function (err) {
            display.toast(err.message || "取消失败");
          });
        }
      }
    });
  },

  onReview: function (e) {
    var that = this;
    var applicantOpenid = e.currentTarget.dataset.openid;
    var decision = e.currentTarget.dataset.decision;
    var activityId = that.data.activityId;

    request("reviewApplication", {
      activityId: activityId,
      applicantOpenid: applicantOpenid,
      decision: decision
    }).then(function () {
      display.toast(decision === "accept" ? "已接受" : "已拒绝");
      that.loadDetail();
    }).catch(function (err) {
      display.toast(err.message || "操作失败");
    });
  },

  onSliderChange: function (e) {
    var field = e.currentTarget.dataset.field;
    var value = e.detail.value;
    var key = "reviewForm." + field;
    this.setData({ [key]: value });
  },

  onReviewCommentInput: function (e) {
    this.setData({ "reviewForm.comment": e.detail.value });
  },

  onSubmitReview: function () {
    var that = this;
    var activityId = that.data.activityId;
    var form = that.data.reviewForm;

    request("submitMatchReview", {
      activityId: activityId,
      relativeScore: form.relativeScore,
      punctuality: form.punctuality,
      focus: form.focus,
      discussion: form.discussion,
      preparation: form.preparation,
      comment: form.comment
    }).then(function () {
      display.toast("评价已提交");
      that.setData({ showReviewForm: false });
      that.loadDetail();
    }).catch(function (err) {
      display.toast(err.message || "提交失败");
    });
  },

  onToggleReportForm: function () {
    this.setData({ showReportForm: !this.data.showReportForm });
  },

  onSelectReportReason: function (e) {
    var index = e.currentTarget.dataset.index;
    var reasons = this.data.reportReasons;
    this.setData({
      selectedReportReason: index,
      "reportForm.reason": reasons[index].value
    });
  },

  onReportDescInput: function (e) {
    this.setData({ "reportForm.description": e.detail.value });
  },

  onReport: function () {
    var that = this;
    var form = that.data.reportForm;
    if (!form.reason) {
      display.toast("请选择举报原因");
      return;
    }
    var activityId = that.data.activityId;
    request("createReport", {
      activityId: activityId,
      reason: form.reason,
      description: form.description
    }).then(function () {
      display.toast("举报已提交");
      that.setData({ showReportForm: false, reportForm: { reason: "", description: "" }, selectedReportReason: -1 });
    }).catch(function (err) {
      display.toast(err.message || "举报失败");
    });
  },

  onBlockCreator: function () {
    var that = this;
    wx.showModal({
      title: "拉黑发起人",
      content: "确定要拉黑此活动发起人吗？拉黑后将不再看到对方发起的活动。",
      success: function (res) {
        if (res.confirm) {
          var activityId = that.data.activityId;
          request("blockActivityCreator", { activityId: activityId }).then(function () {
            display.toast("已拉黑");
            wx.navigateBack();
          }).catch(function (err) {
            display.toast(err.message || "操作失败");
          });
        }
      }
    });
  },

  onOpenMap: function () {
    var activity = this.data.activity;
    if (!activity || !activity.location) return;
    var loc = activity.location;
    wx.openLocation({
      latitude: loc.latitude || 0,
      longitude: loc.longitude || 0,
      name: loc.name || "",
      address: loc.address || "",
      scale: 16
    });
  },

  onSharePoster: function () {
    var that = this;
    if (that.data.poster && that.data.poster.imageUrl) {
      wx.previewImage({
        urls: [that.data.poster.imageUrl],
        current: that.data.poster.imageUrl
      });
    }
  },

  onShareAppMessage: function () {
    var activity = this.data.activity || {};
    var poster = this.data.poster || {};
    return {
      title: activity.title || "读书搭子活动",
      path: "/pages/activity-detail/activity-detail?id=" + this.data.activityId,
      imageUrl: poster.imageUrl || ""
    };
  },

  onShareTimeline: function () {
    var activity = this.data.activity || {};
    var poster = this.data.poster || {};
    return {
      title: activity.title || "读书搭子活动",
      query: "id=" + this.data.activityId,
      imageUrl: poster.imageUrl || ""
    };
  }
});
