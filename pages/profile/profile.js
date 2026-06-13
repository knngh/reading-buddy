var display = require("../../utils/display");
var request = require("../../utils/request").request;

var GENRE_OPTIONS = [
  { key: "literature", label: "文学小说" },
  { key: "business", label: "商业管理" },
  { key: "tech", label: "科技互联网" },
  { key: "history", label: "历史人文" },
  { key: "psychology", label: "心理学" },
  { key: "philosophy", label: "哲学思想" },
  { key: "self_help", label: "自我提升" },
  { key: "art", label: "艺术设计" },
  { key: "scifi", label: "科幻悬疑" },
  { key: "biography", label: "人物传记" },
  { key: "education", label: "教育学习" }
];

var LEVEL_OPTIONS = [
  { key: "beginner", label: "入门读者" },
  { key: "intermediate", label: "进阶读者" },
  { key: "advanced", label: "资深读者" },
  { key: "all", label: "不限水平" }
];

var SLOT_OPTIONS = [
  { key: "weekday_morning", label: "工作日早晨" },
  { key: "weekday_afternoon", label: "工作日下午" },
  { key: "weekday_evening", label: "工作日晚间" },
  { key: "weekend_morning", label: "周末早晨" },
  { key: "weekend_afternoon", label: "周末下午" },
  { key: "weekend_evening", label: "周末晚间" }
];

var CITY_OPTIONS = ["北京", "上海", "广州", "深圳", "杭州"];

var DISTRICT_MAP = {
  "北京": ["朝阳区", "海淀区", "东城区", "西城区", "丰台区", "通州区", "大兴区", "昌平区"],
  "上海": ["浦东新区", "徐汇区", "静安区", "长宁区", "黄浦区", "虹口区", "杨浦区", "闵行区"],
  "广州": ["天河区", "越秀区", "海珠区", "荔湾区", "白云区", "番禺区", "黄埔区", "花都区"],
  "深圳": ["南山区", "福田区", "罗湖区", "宝安区", "龙岗区", "龙华区", "光明区", "盐田区"],
  "杭州": ["西湖区", "上城区", "拱墅区", "滨江区", "余杭区", "萧山区", "临平区", "钱塘区"]
};

function getGenreLabel(key) {
  for (var i = 0; i < GENRE_OPTIONS.length; i++) {
    if (GENRE_OPTIONS[i].key === key) return GENRE_OPTIONS[i].label;
  }
  return key;
}

function getSlotLabel(key) {
  for (var i = 0; i < SLOT_OPTIONS.length; i++) {
    if (SLOT_OPTIONS[i].key === key) return SLOT_OPTIONS[i].label;
  }
  return key;
}

Page({
  data: {
    user: null,
    profileCompletion: 0,
    reliabilityProfile: {
      trustScore: 0,
      completionRate: 0,
      confirmationRate: 0,
      cancellationRate: 0,
      badges: [],
      signals: []
    },
    aiProfile: {
      summary: "",
      personaTags: [],
      strengths: [],
      recommendationStrategy: "",
      gaps: [],
      nextActions: [],
      feedbackSignals: null,
      genreTags: [],
      slotTags: []
    },
    matchRating: {
      overall: 0,
      punctuality: 0,
      focus: 0,
      discussion: 0,
      preparation: 0,
      reviewCount: 0
    },
    form: {
      nickname: "",
      city: "",
      district: "",
      readingLevel: "",
      preferredGenres: [],
      availableSlots: [],
      bio: ""
    },
    GENRE_OPTIONS: GENRE_OPTIONS,
    LEVEL_OPTIONS: LEVEL_OPTIONS,
    SLOT_OPTIONS: SLOT_OPTIONS,
    CITY_OPTIONS: CITY_OPTIONS,
    districtOptions: [],
    cityIndex: 0,
    districtIndex: 0,
    levelIndex: 0,
    saving: false,
    editing: false
  },

  onShow: function () {
    this.loadProfile();
  },

  loadProfile: function () {
    var that = this;
    wx.showLoading({ title: "加载中..." });

    Promise.all([
      new Promise(function (resolve) {
        request("getUserInfo", {}, function (res) {
          resolve(res);
        });
      }),
      new Promise(function (resolve) {
        that.loadReliability(function (res) {
          resolve(res);
        });
      }),
      new Promise(function (resolve) {
        that.loadAiProfile(function (res) {
          resolve(res);
        });
      }),
      new Promise(function (resolve) {
        that.loadMatchRating(function (res) {
          resolve(res);
        });
      })
    ]).then(function (results) {
      wx.hideLoading();
      var userInfo = results[0];
      var reliability = results[1];
      var aiProfile = results[2];
      var matchRating = results[3];

      var user = userInfo && userInfo.data ? userInfo.data : userInfo;
      var completion = user.profileCompletion || 0;

      // Build form from user data
      var form = {
        nickname: user.nickname || "",
        city: user.city || "",
        district: user.district || "",
        readingLevel: user.readingLevel || "",
        preferredGenres: user.preferredGenres || [],
        availableSlots: user.availableSlots || [],
        bio: user.bio || ""
      };

      // Compute city index
      var cityIndex = CITY_OPTIONS.indexOf(form.city);
      if (cityIndex === -1) cityIndex = 0;

      // Compute district options and index
      var districtOptions = DISTRICT_MAP[form.city] || [];
      var districtIndex = districtOptions.indexOf(form.district);
      if (districtIndex === -1) districtIndex = 0;

      // Compute level index
      var levelIndex = 0;
      for (var i = 0; i < LEVEL_OPTIONS.length; i++) {
        if (LEVEL_OPTIONS[i].key === form.readingLevel) {
          levelIndex = i;
          break;
        }
      }

      // Process reliability data
      var rel = reliability || {};
      var reliabilityProfile = {
        trustScore: rel.trustScore || 0,
        completionRate: rel.completionRate || 0,
        confirmationRate: rel.confirmationRate || 0,
        cancellationRate: rel.cancellationRate || 0,
        badges: rel.badges || [],
        signals: rel.signals || []
      };

      // Process AI profile data
      var ai = aiProfile || {};
      var processedAiProfile = {
        summary: ai.summary || "",
        personaTags: ai.personaTags || [],
        strengths: ai.strengths || [],
        recommendationStrategy: ai.recommendationStrategy || "",
        gaps: ai.gaps || [],
        nextActions: ai.nextActions || [],
        feedbackSignals: ai.feedbackSignals || null,
        genreTags: ai.genreTags || [],
        slotTags: ai.slotTags || []
      };

      // Process match rating data
      var mr = matchRating || {};
      var processedMatchRating = {
        overall: mr.overall || 0,
        punctuality: mr.punctuality || 0,
        focus: mr.focus || 0,
        discussion: mr.discussion || 0,
        preparation: mr.preparation || 0,
        reviewCount: mr.reviewCount || 0
      };

      that.setData({
        user: user,
        profileCompletion: completion,
        reliabilityProfile: reliabilityProfile,
        aiProfile: processedAiProfile,
        matchRating: processedMatchRating,
        form: form,
        cityIndex: cityIndex,
        districtIndex: districtIndex,
        levelIndex: levelIndex,
        districtOptions: districtOptions
      });
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: "加载失败", icon: "none" });
    });
  },

  loadReliability: function (callback) {
    request("getReliabilityProfile", {}, function (res) {
      var data = res && res.data ? res.data : res;
      callback(data);
    });
  },

  loadAiProfile: function (callback) {
    request("getAiProfile", {}, function (res) {
      var data = res && res.data ? res.data : res;
      callback(data);
    });
  },

  loadMatchRating: function (callback) {
    request("getMatchRatingProfile", {}, function (res) {
      var data = res && res.data ? res.data : res;
      callback(data);
    });
  },

  onToggleEdit: function () {
    this.setData({ editing: !this.data.editing });
  },

  onNicknameInput: function (e) {
    this.setData({ "form.nickname": e.detail.value });
  },

  onBioInput: function (e) {
    this.setData({ "form.bio": e.detail.value });
  },

  onCityChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var city = CITY_OPTIONS[idx];
    var districtOptions = DISTRICT_MAP[city] || [];
    this.setData({
      cityIndex: idx,
      "form.city": city,
      districtOptions: districtOptions,
      districtIndex: 0,
      "form.district": districtOptions[0] || ""
    });
  },

  onDistrictChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var district = this.data.districtOptions[idx] || "";
    this.setData({
      districtIndex: idx,
      "form.district": district
    });
  },

  onLevelChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    this.setData({
      levelIndex: idx,
      "form.readingLevel": LEVEL_OPTIONS[idx].key
    });
  },

  onGenreToggle: function (e) {
    var key = e.currentTarget.dataset.key;
    var genres = this.data.form.preferredGenres.slice();
    var idx = genres.indexOf(key);
    if (idx > -1) {
      genres.splice(idx, 1);
    } else {
      if (genres.length >= 8) {
        wx.showToast({ title: "最多选择8个类型", icon: "none" });
        return;
      }
      genres.push(key);
    }
    this.setData({ "form.preferredGenres": genres });
  },

  onSlotToggle: function (e) {
    var key = e.currentTarget.dataset.key;
    var slots = this.data.form.availableSlots.slice();
    var idx = slots.indexOf(key);
    if (idx > -1) {
      slots.splice(idx, 1);
    } else {
      if (slots.length >= 12) {
        wx.showToast({ title: "最多选择12个时段", icon: "none" });
        return;
      }
      slots.push(key);
    }
    this.setData({ "form.availableSlots": slots });
  },

  onSaveProfile: function () {
    var form = this.data.form;

    // Validate
    if (!form.nickname || form.nickname.trim().length === 0) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }
    if (!form.city) {
      wx.showToast({ title: "请选择城市", icon: "none" });
      return;
    }
    if (!form.readingLevel) {
      wx.showToast({ title: "请选择阅读水平", icon: "none" });
      return;
    }
    if (form.preferredGenres.length === 0) {
      wx.showToast({ title: "请至少选择一个阅读类型", icon: "none" });
      return;
    }
    if (form.bio && form.bio.length > 80) {
      wx.showToast({ title: "个人简介不能超过80字", icon: "none" });
      return;
    }

    var that = this;
    that.setData({ saving: true });
    wx.showLoading({ title: "保存中..." });

    request("updateProfile", form, function (res) {
      wx.hideLoading();
      that.setData({ saving: false, editing: false });
      wx.showToast({ title: "保存成功", icon: "success" });
      that.loadProfile();
    });
  },

  onGoManage: function () {
    wx.switchTab({ url: "/pages/chat-list/chat-list" });
  },

  onGoPrivacy: function () {
    wx.navigateTo({ url: "/pages/privacy/privacy" });
  }
});
