/**
 * 读书搭子 - Mock 后端
 * 纯内存实现，持久化到 wx.setStorageSync("reading_buddy.mock_db")
 * 无外部依赖，自包含所有内容审核、AI 打分、推荐算法
 */

// ============================================================
//  常量
// ============================================================

var STORAGE_KEY = "reading_buddy.mock_db";

var GENRE_LABELS = {
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

var LEVEL_LABELS = {
  beginner: "入门读者",
  intermediate: "进阶读者",
  advanced: "资深读者",
  all: "不限水平"
};

var SLOT_LABELS = {
  weekday_morning: "工作日上午",
  weekday_afternoon: "工作日下午",
  weekday_evening: "工作日晚上",
  weekend_morning: "周末上午",
  weekend_afternoon: "周末下午",
  weekend_evening: "周末晚上"
};

var CITY_DISTRICTS = {
  "北京": ["朝阳区", "海淀区", "东城区", "西城区", "丰台区", "通州区", "大兴区", "昌平区"],
  "上海": ["浦东新区", "徐汇区", "静安区", "黄浦区", "长宁区", "虹口区", "杨浦区", "闵行区"],
  "广州": ["天河区", "越秀区", "海珠区", "荔湾区", "白云区", "番禺区", "黄埔区"],
  "深圳": ["南山区", "福田区", "罗湖区", "宝安区", "龙岗区", "龙华区", "光明区"],
  "杭州": ["西湖区", "上城区", "拱墅区", "滨江区", "余杭区", "萧山区", "钱塘区"]
};

var BLOCKED_TERMS = ["代写", "加微信", "加QQ", "转账", "红包", "付费"];

// 手机号正则 (中国大陆)
var PHONE_REGEX = /1[3-9]\d{9}/;
// 微信号正则
var WECHAT_REGEX = /(微信[号\s]*[:：]?\s*[a-zA-Z\d_-]{5,20})|(wxid_[a-zA-Z\d_]+)/i;
// QQ号正则
var QQ_REGEX = /(QQ[号\s]*[:：]?\s*\d{5,12})|([^.]\d{5,12}@qq\.com)/i;

// ============================================================
//  DB 读写
// ============================================================

var db = null;

function defaultDB() {
  return {
    users: [],
    activities: [],
    applications: [],
    matchIntents: [],
    recommendationFeedback: [],
    activityShares: [],
    userBlocks: [],
    matchReviews: [],
    reports: [],
    aiCache: [],
    aiUsageDaily: []
  };
}

function load() {
  if (db) return db;
  try {
    var raw = wx.getStorageSync(STORAGE_KEY);
    if (raw && typeof raw === "object" && raw.users) {
      db = raw;
    } else {
      db = defaultDB();
      buildSeedData();
      save();
    }
  } catch (e) {
    db = defaultDB();
    buildSeedData();
    save();
  }
  return db;
}

function save() {
  try {
    wx.setStorageSync(STORAGE_KEY, db);
  } catch (e) {
    console.error("Mock DB 持久化失败", e);
  }
}

// ============================================================
//  工具函数
// ============================================================

function generateId() {
  var hex = "0123456789abcdef";
  var id = "";
  for (var i = 0; i < 16; i++) {
    id += hex[Math.floor(Math.random() * 16)];
  }
  return id;
}

function now() {
  return new Date().toISOString();
}

function futureISO(hoursFromNow) {
  var d = new Date();
  d.setHours(d.getHours() + (hoursFromNow || 0));
  return d.toISOString();
}

function pastISO(hoursAgo) {
  var d = new Date();
  d.setHours(d.getHours() - (hoursAgo || 0));
  return d.toISOString();
}

function findUser(openid) {
  load();
  for (var i = 0; i < db.users.length; i++) {
    if (db.users[i].openid === openid) return db.users[i];
  }
  return null;
}

function findActivity(id) {
  load();
  for (var i = 0; i < db.activities.length; i++) {
    if (db.activities[i].id === id) return db.activities[i];
  }
  return null;
}

function findApplication(id) {
  load();
  for (var i = 0; i < db.applications.length; i++) {
    if (db.applications[i].id === id) return db.applications[i];
  }
  return null;
}

function findApplicationByPair(activityId, openid) {
  load();
  for (var i = 0; i < db.applications.length; i++) {
    var a = db.applications[i];
    if (a.activityId === activityId && a.applicantOpenid === openid) return a;
  }
  return null;
}

function ok(data) {
  return { ok: true, data: data };
}

function fail(error) {
  return { ok: false, error: error };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function hoursBetween(isoA, isoB) {
  var a = new Date(isoA).getTime();
  var b = new Date(isoB).getTime();
  return (b - a) / 3600000;
}

function arrayRemove(arr, item) {
  var idx = arr.indexOf(item);
  if (idx >= 0) arr.splice(idx, 1);
}

function shallowCopy(obj) {
  var out = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    out[keys[i]] = obj[keys[i]];
  }
  return out;
}

// ============================================================
//  内容审核
// ============================================================

function moderateContent(text) {
  if (!text) return { verdict: "auto_passed", reasons: [] };
  var reasons = [];

  if (PHONE_REGEX.test(text)) {
    reasons.push("检测到手机号");
  }
  if (WECHAT_REGEX.test(text)) {
    reasons.push("检测到微信号");
  }
  if (QQ_REGEX.test(text)) {
    reasons.push("检测到QQ号");
  }
  for (var i = 0; i < BLOCKED_TERMS.length; i++) {
    if (text.indexOf(BLOCKED_TERMS[i]) >= 0) {
      reasons.push("包含敏感词: " + BLOCKED_TERMS[i]);
    }
  }

  if (reasons.length === 0) {
    return { verdict: "auto_passed", reasons: [] };
  }
  // 仅手机号单独出现给 needs_review，其它组合直接 blocked
  var hasSerious = false;
  for (var j = 0; j < reasons.length; j++) {
    if (reasons[j] !== "检测到手机号") {
      hasSerious = true;
      break;
    }
  }
  return {
    verdict: hasSerious ? "blocked" : "needs_review",
    reasons: reasons
  };
}

function moderateActivity(activity) {
  var fields = [
    activity.title || "",
    activity.description || "",
    activity.discussionTopic || "",
    activity.locationName || ""
  ];
  var combined = fields.join(" ");
  var result = moderateContent(combined);
  return result;
}

// ============================================================
//  AI 打分 / Mock AI
// ============================================================

function scoreActivityContent(activity) {
  // 简单评分: 标题长度、描述长度、有无讨论话题
  var score = 50;
  if (activity.title && activity.title.length >= 4) score += 10;
  if (activity.description && activity.description.length >= 20) score += 15;
  if (activity.discussionTopic && activity.discussionTopic.length >= 5) score += 10;
  if (activity.locationName) score += 5;
  if (activity.startAt) score += 5;
  if (activity.maxParticipants >= 2 && activity.maxParticipants <= 20) score += 5;
  return clamp(score, 0, 100);
}

function mockAiActivityDraft(data) {
  var genre = data.genre || "literature";
  var bookName = data.bookName || "";
  var genreLabel = GENRE_LABELS[genre] || "读书";

  var titleTemplates = [
    "《" + (bookName || "好书") + "》线下共读会",
    genreLabel + "深度阅读沙龙",
    "周末" + genreLabel + "读书分享会",
    "一起读《" + (bookName || "经典") + "》—— " + genreLabel + "共读活动"
  ];
  var title = titleTemplates[Math.floor(Math.random() * titleTemplates.length)];

  var descParagraphs = [
    "欢迎热爱" + genreLabel + "的书友参加本次共读活动。我们将一起阅读、讨论、分享心得，在交流中碰撞出新的思想火花。",
    "本次活动面向" + genreLabel + "爱好者，无论你是入门读者还是资深书虫，都可以在这里找到共鸣。我们会围绕书中核心议题展开深入讨论。",
    "这是一次" + genreLabel + "领域的线下交流活动，希望大家在轻松愉快的氛围中分享阅读体验，结交志同道合的书友。"
  ];
  var description = descParagraphs[Math.floor(Math.random() * descParagraphs.length)];

  var topicTemplates = [
    "书中的核心主题对我们日常生活有哪些启发？",
    "作者想要传达的最重要的信息是什么？你如何理解？",
    "书中哪个角色或案例最打动你？为什么？",
    "这本书改变了你对哪个问题的看法？"
  ];
  var discussionTopic = topicTemplates[Math.floor(Math.random() * topicTemplates.length)];

  return {
    title: title,
    description: description,
    discussionTopic: discussionTopic
  };
}

function mockAiProfileInsight(user) {
  var genres = user.preferredGenres || [];
  var genreNames = [];
  for (var i = 0; i < genres.length; i++) {
    genreNames.push(GENRE_LABELS[genres[i]] || genres[i]);
  }
  var genreStr = genreNames.length > 0 ? genreNames.join("、") : "多元领域";

  var level = LEVEL_LABELS[user.readingLevel] || "阅读爱好者";
  var tags = [level];
  if (genres.length >= 3) tags.push("涉猎广泛");
  if (genres.length === 1) tags.push("专注深耕");
  if (user.bio && user.bio.length > 20) tags.push("认真书友");

  var summary = "这是一位来自" + (user.city || "未知城市") + "的" + level +
    "，偏好阅读" + genreStr + "类书籍";
  if (user.bio) {
    summary += "，个人简介中展现出对阅读的真诚热爱";
  }
  summary += "。建议参加同城线下读书会，结识更多志同道合的书友。";

  return {
    personaTags: tags,
    summary: summary,
    suggestions: [
      "可以尝试跨领域阅读，拓宽知识面",
      "建议定期参加线下读书活动，增强社交阅读体验",
      "阅读后可撰写简短笔记，加深理解"
    ]
  };
}

function mockAiMatchExplain(scoreBreakdown) {
  var parts = [];
  if (scoreBreakdown.cityScore > 0) parts.push("同城活动，出行方便");
  if (scoreBreakdown.districtScore > 0) parts.push("同区域，距离很近");
  if (scoreBreakdown.genreScore > 0) parts.push("符合你的阅读偏好");
  if (scoreBreakdown.levelScore > 0) parts.push("阅读水平匹配");
  if (scoreBreakdown.timeScore > 0) parts.push("时间档契合你的空闲时段");
  if (scoreBreakdown.nearTermScore > 0) parts.push("近期活动，趁热打铁");
  if (scoreBreakdown.spotsScore > 0) parts.push("还有名额，抓紧报名");

  if (parts.length === 0) {
    parts.push("这是一个值得探索的活动，也许会发现新的阅读兴趣");
  }
  return parts.join("；") + "。";
}

function mockAiReportTriage(report) {
  var category = report.category || "other";
  var priority = "medium";
  if (category === "harassment" || category === "fraud") priority = "high";
  if (category === "spam") priority = "low";

  var suggestions = [];
  if (category === "harassment") {
    suggestions.push("建议立即屏蔽该用户");
    suggestions.push("保留聊天记录作为证据");
  } else if (category === "fraud") {
    suggestions.push("核实活动真实性");
    suggestions.push("检查该用户创建的其他活动");
  } else if (category === "spam") {
    suggestions.push("检查是否为批量注册账号");
  } else {
    suggestions.push("人工审核后决定处理方式");
  }

  return {
    priority: priority,
    category: category,
    suggestions: suggestions,
    autoAction: priority === "high" ? "flag_user" : null
  };
}

function getAiUsageToday() {
  load();
  var today = new Date().toISOString().slice(0, 10);
  for (var i = 0; i < db.aiUsageDaily.length; i++) {
    if (db.aiUsageDaily[i].date === today) return db.aiUsageDaily[i];
  }
  var entry = { date: today, count: 0, limit: 50 };
  db.aiUsageDaily.push(entry);
  return entry;
}

function incrementAiUsage() {
  var entry = getAiUsageToday();
  entry.count += 1;
  save();
  return entry;
}

// ============================================================
//  推荐算法
// ============================================================

function scoreActivityForUser(activity, user, feedbackMap) {
  var base = 18;
  var breakdown = {
    baseScore: base,
    cityScore: 0,
    districtScore: 0,
    genreScore: 0,
    levelScore: 0,
    timeScore: 0,
    nearTermScore: 0,
    spotsScore: 0,
    distanceScore: 0,
    reliabilityScore: 0
  };

  // 同城
  if (user.city && activity.city === user.city) {
    breakdown.cityScore = 24;
    // 同区
    if (user.district && activity.district === user.district) {
      breakdown.districtScore = 14;
    }
  }

  // 类型偏好
  if (user.preferredGenres && user.preferredGenres.length > 0) {
    if (user.preferredGenres.indexOf(activity.genre) >= 0) {
      breakdown.genreScore = 24;
    }
  }

  // 阅读水平匹配
  if (activity.readingLevel && user.readingLevel) {
    if (activity.readingLevel === "all") {
      breakdown.levelScore = 8;
    } else if (activity.readingLevel === user.readingLevel) {
      breakdown.levelScore = 12;
    } else {
      // 相邻等级给部分分
      var levels = ["beginner", "intermediate", "advanced"];
      var aIdx = levels.indexOf(activity.readingLevel);
      var uIdx = levels.indexOf(user.readingLevel);
      if (aIdx >= 0 && uIdx >= 0 && Math.abs(aIdx - uIdx) === 1) {
        breakdown.levelScore = 8;
      }
    }
  }

  // 时间档匹配
  if (user.availableSlots && user.availableSlots.length > 0 && activity.startAt) {
    var actDate = new Date(activity.startAt);
    var dayOfWeek = actDate.getDay();
    var hour = actDate.getHours();
    var isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    var slotPrefix = isWeekend ? "weekend" : "weekday";
    var slotSuffix;
    if (hour < 12) slotSuffix = "morning";
    else if (hour < 18) slotSuffix = "afternoon";
    else slotSuffix = "evening";
    var actSlot = slotPrefix + "_" + slotSuffix;

    if (user.availableSlots.indexOf(actSlot) >= 0) {
      breakdown.timeScore = 12;
    } else {
      // 同 prefix 的其他时段给半分
      for (var si = 0; si < user.availableSlots.length; si++) {
        if (user.availableSlots[si].indexOf(slotPrefix) === 0) {
          breakdown.timeScore = 8;
          break;
        }
      }
    }
  }

  // 近期活动 (2~72h)
  if (activity.startAt) {
    var hoursUntil = hoursBetween(now(), activity.startAt);
    if (hoursUntil >= 2 && hoursUntil <= 72) {
      breakdown.nearTermScore = 12;
    } else if (hoursUntil > 0 && hoursUntil < 2) {
      breakdown.nearTermScore = 6;
    }
  }

  // 剩余名额
  var spotsLeft = (activity.maxParticipants || 0) - (activity.acceptedCount || 0);
  if (spotsLeft > 0) {
    breakdown.spotsScore = 6;
  }

  // 距离分 (如果有坐标)
  if (activity.latitude && activity.longitude && user._lat && user._lng) {
    var dist = calcDistance(user._lat, user._lng, activity.latitude, activity.longitude);
    if (dist < 3000) breakdown.distanceScore = 10;
    else if (dist < 5000) breakdown.distanceScore = 7;
    else if (dist < 10000) breakdown.distanceScore = 4;
    else if (dist < 20000) breakdown.distanceScore = 2;
  }

  // 发起人可靠度
  var creatorScore = activity.creatorTrustScore || 50;
  if (creatorScore >= 80) breakdown.reliabilityScore = 6;
  else if (creatorScore >= 60) breakdown.reliabilityScore = 4;
  else if (creatorScore >= 40) breakdown.reliabilityScore = 2;

  var total = breakdown.baseScore +
    breakdown.cityScore +
    breakdown.districtScore +
    breakdown.genreScore +
    breakdown.levelScore +
    breakdown.timeScore +
    breakdown.nearTermScore +
    breakdown.spotsScore +
    breakdown.distanceScore +
    breakdown.reliabilityScore;

  total = clamp(total, 0, 100);

  // 匹配等级
  var matchLevel;
  if (total >= 85) matchLevel = "S";
  else if (total >= 75) matchLevel = "A";
  else if (total >= 60) matchLevel = "B";
  else if (total >= 40) matchLevel = "C";
  else matchLevel = "D";

  // 检查用户反馈
  var fbPenalty = 0;
  if (feedbackMap) {
    var fb = feedbackMap[activity.id];
    if (fb) {
      if (fb.feedback === "not_interested") fbPenalty = -30;
      if (fb.feedback === "hidden") fbPenalty = -100;
    }
  }
  total = clamp(total + fbPenalty, 0, 100);
  if (total >= 85) matchLevel = "S";
  else if (total >= 75) matchLevel = "A";
  else if (total >= 60) matchLevel = "B";
  else if (total >= 40) matchLevel = "C";
  else matchLevel = "D";

  return {
    score: total,
    matchLevel: matchLevel,
    breakdown: breakdown,
    aiExplain: mockAiMatchExplain(breakdown)
  };
}

function calcDistance(lat1, lng1, lat2, lng2) {
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

// ============================================================
//  用户可靠度 / 信任分
// ============================================================

function computeUserTrustScore(openid) {
  load();
  var user = findUser(openid);
  if (!user) return 50;

  var score = 50; // 基准分

  // 个人资料完整度加分
  if (user.profileCompletion) {
    score += Math.floor(user.profileCompletion * 0.15);
  }

  // 创建活动历史
  var createdCount = 0;
  var cancelledCount = 0;
  for (var i = 0; i < db.activities.length; i++) {
    if (db.activities[i].creatorOpenid === openid) {
      createdCount++;
      if (db.activities[i].status === "cancelled") cancelledCount++;
    }
  }
  if (createdCount > 0) score += Math.min(createdCount * 3, 15);
  if (cancelledCount > 0) score -= cancelledCount * 5;

  // 收到的评价
  var reviews = [];
  for (var j = 0; j < db.matchReviews.length; j++) {
    if (db.matchReviews[j].targetOpenid === openid) {
      reviews.push(db.matchReviews[j]);
    }
  }
  if (reviews.length > 0) {
    var avgRating = 0;
    for (var k = 0; k < reviews.length; k++) {
      var r = reviews[k];
      var rAvg = ((r.punctuality || 3) + (r.focus || 3) + (r.discussion || 3) + (r.preparation || 3)) / 4;
      avgRating += rAvg;
    }
    avgRating = avgRating / reviews.length;
    // avgRating 1~5 -> 映射 -10 ~ +15
    score += Math.round((avgRating - 3) * 5);
  }

  // 被举报扣分
  for (var m = 0; m < db.reports.length; m++) {
    if (db.reports[m].targetOpenid === openid && db.reports[m].status !== "resolved_false") {
      score -= 10;
    }
  }

  return clamp(score, 0, 100);
}

// ============================================================
//  资料完整度
// ============================================================

function calcProfileCompletion(user) {
  var fields = [
    user.nickname ? 1 : 0,
    user.avatarUrl ? 1 : 0,
    user.city ? 1 : 0,
    user.district ? 1 : 0,
    user.readingLevel ? 1 : 0,
    (user.preferredGenres && user.preferredGenres.length > 0) ? 1 : 0,
    (user.availableSlots && user.availableSlots.length > 0) ? 1 : 0,
    user.bio ? 1 : 0
  ];
  var filled = 0;
  for (var i = 0; i < fields.length; i++) filled += fields[i];
  return Math.round((filled / fields.length) * 100);
}

// ============================================================
//  API: login
// ============================================================

function handleLogin(data) {
  load();
  // 使用固定 openid 便于测试
  var openid = (data && data.openid) || ("mock_" + generateId());

  var existing = findUser(openid);
  if (existing) {
    return ok(existing);
  }

  var user = {
    openid: openid,
    nickname: "",
    avatarUrl: "",
    city: "",
    district: "",
    readingLevel: "",
    preferredGenres: [],
    availableSlots: [],
    bio: "",
    identityStatus: "new",
    profileCompletion: 0,
    createdAt: now(),
    updatedAt: now()
  };
  db.users.push(user);
  save();
  return ok(user);
}

// ============================================================
//  API: me
// ============================================================

function handleMe(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  // 刷新信任分
  user.trustScore = computeUserTrustScore(openid);
  save();

  return ok(user);
}

// ============================================================
//  API: getDashboard
// ============================================================

function handleGetDashboard(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  // 统计
  var myCreatedCount = 0;
  var myApplicationCount = 0;
  var upcomingCount = 0;
  var currentTs = new Date().getTime();

  for (var i = 0; i < db.activities.length; i++) {
    var act = db.activities[i];
    if (act.creatorOpenid === openid && act.status !== "cancelled") {
      myCreatedCount++;
      if (new Date(act.startAt).getTime() > currentTs) upcomingCount++;
    }
  }
  for (var j = 0; j < db.applications.length; j++) {
    var app = db.applications[j];
    if (app.applicantOpenid === openid && app.status !== "cancelled" && app.status !== "rejected") {
      myApplicationCount++;
    }
  }

  // 最佳匹配活动
  var bestMatch = null;
  var bestScore = -1;
  var feedbackMap = buildFeedbackMap(openid);
  var blockedOpenids = buildBlockedSet(openid);

  for (var k = 0; k < db.activities.length; k++) {
    var a = db.activities[k];
    if (a.status !== "open") continue;
    if (a.creatorOpenid === openid) continue;
    if (blockedOpenids[a.creatorOpenid]) continue;

    var scored = scoreActivityForUser(a, user, feedbackMap);
    if (scored.score > bestScore) {
      bestScore = scored.score;
      bestMatch = {
        activity: a,
        score: scored.score,
        matchLevel: scored.matchLevel,
        aiExplain: scored.aiExplain
      };
    }
  }

  // 意向池匹配数
  var intentCount = 0;
  for (var m = 0; m < db.matchIntents.length; m++) {
    var intent = db.matchIntents[m];
    if (intent.openid !== openid && intent.city === user.city && intent.genre === (user.preferredGenres && user.preferredGenres[0])) {
      intentCount++;
    }
  }

  // 附近活动 (同城 open 活动)
  var nearbyActivities = [];
  for (var n = 0; n < db.activities.length; n++) {
    var na = db.activities[n];
    if (na.status === "open" && na.city === user.city && na.creatorOpenid !== openid) {
      nearbyActivities.push({
        id: na.id,
        title: na.title,
        genre: na.genre,
        startAt: na.startAt,
        district: na.district,
        spotsLeft: (na.maxParticipants || 0) - (na.acceptedCount || 0)
      });
    }
  }
  nearbyActivities.sort(function (a, b) {
    return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  });
  nearbyActivities = nearbyActivities.slice(0, 5);

  // 资料完善提示
  var profileTips = [];
  if (!user.nickname) profileTips.push("设置昵称让书友认识你");
  if (!user.city) profileTips.push("选择所在城市，发现同城活动");
  if (!user.readingLevel) profileTips.push("设置阅读水平，获得精准推荐");
  if (!user.preferredGenres || user.preferredGenres.length === 0) profileTips.push("选择喜欢的书籍类型");
  if (!user.availableSlots || user.availableSlots.length === 0) profileTips.push("设置空闲时间，匹配合适时段");
  if (!user.bio) profileTips.push("写一段自我介绍，增加通过率");

  // AI 洞察
  var aiInsight = null;
  if (user.profileCompletion >= 50) {
    aiInsight = mockAiProfileInsight(user);
  }

  return ok({
    stats: {
      createdCount: myCreatedCount,
      applicationCount: myApplicationCount,
      upcomingCount: upcomingCount,
      reviewCount: db.matchReviews.filter(function (r) { return r.targetOpenid === openid; }).length
    },
    bestMatch: bestMatch,
    intentPoolMatches: intentCount,
    nearbyActivities: nearbyActivities,
    profileTips: profileTips,
    aiInsight: aiInsight,
    profileCompletion: user.profileCompletion
  });
}

// ============================================================
//  API: updateProfile
// ============================================================

function handleUpdateProfile(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  var allowedFields = [
    "nickname", "avatarUrl", "city", "district",
    "readingLevel", "preferredGenres", "availableSlots", "bio"
  ];

  for (var i = 0; i < allowedFields.length; i++) {
    var field = allowedFields[i];
    if (data[field] !== undefined) {
      user[field] = data[field];
    }
  }

  user.profileCompletion = calcProfileCompletion(user);

  if (user.profileCompletion >= 50 && user.identityStatus === "new") {
    user.identityStatus = "active";
  }

  user.updatedAt = now();
  save();

  return ok(user);
}

// ============================================================
//  API: createActivity
// ============================================================

function handleCreateActivity(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  // 内容审核
  var activityDraft = {
    title: data.title || "",
    description: data.description || "",
    discussionTopic: data.discussionTopic || "",
    locationName: data.locationName || ""
  };
  var moderation = moderateActivity(activityDraft);

  if (moderation.verdict === "blocked") {
    return fail("内容审核未通过: " + moderation.reasons.join("，"));
  }

  var trustScore = computeUserTrustScore(openid);
  var aiScore = scoreActivityContent(activityDraft);

  var activity = {
    id: generateId(),
    creatorOpenid: openid,
    title: data.title || "未命名活动",
    genre: data.genre || "literature",
    description: data.description || "",
    city: data.city || user.city || "",
    district: data.district || user.district || "",
    locationName: data.locationName || "",
    locationAddress: data.locationAddress || "",
    latitude: data.latitude || 0,
    longitude: data.longitude || 0,
    startAt: data.startAt || "",
    endAt: data.endAt || "",
    maxParticipants: data.maxParticipants || 6,
    readingLevel: data.readingLevel || "all",
    bookMode: data.bookMode || "bring_own",
    format: data.format || "offline",
    discussionTopic: data.discussionTopic || "",
    creatorTrustScore: trustScore,
    approvalMode: data.approvalMode || "manual",
    auditStatus: moderation.verdict,
    aiModeration: moderation,
    aiScore: aiScore,
    status: "open",
    acceptedCount: 0,
    waitlistCount: 0,
    confirmedCount: 0,
    createdAt: now(),
    updatedAt: now()
  };

  db.activities.push(activity);
  save();

  return ok(activity);
}

// ============================================================
//  API: cancelActivity
// ============================================================

function handleCancelActivity(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var activity = findActivity(data.activityId);
  if (!activity) return fail("活动不存在");
  if (activity.creatorOpenid !== openid) return fail("无权操作");

  activity.status = "cancelled";
  activity.updatedAt = now();

  // 级联取消所有申请
  for (var i = 0; i < db.applications.length; i++) {
    var app = db.applications[i];
    if (app.activityId === data.activityId && app.status !== "cancelled") {
      app.status = "cancelled";
      app.cancelReason = "活动已取消";
      app.cancelledAt = now();
      app.updatedAt = now();
    }
  }

  save();
  return ok(activity);
}

// ============================================================
//  API: applyActivity
// ============================================================

function handleApplyActivity(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");
  var activity = findActivity(data.activityId);
  if (!activity) return fail("活动不存在");
  if (activity.status !== "open") return fail("活动不在报名中");
  if (activity.creatorOpenid === openid) return fail("不能报名自己创建的活动");

  // 检查是否已被屏蔽
  var isBlocked = false;
  for (var b = 0; b < db.userBlocks.length; b++) {
    var block = db.userBlocks[b];
    if ((block.blockerOpenid === openid && block.blockedOpenid === activity.creatorOpenid) ||
        (block.blockerOpenid === activity.creatorOpenid && block.blockedOpenid === openid)) {
      isBlocked = true;
      break;
    }
  }
  if (isBlocked) return fail("无法报名该活动");

  // 检查重复申请
  var existing = findApplicationByPair(data.activityId, openid);
  if (existing && existing.status !== "cancelled" && existing.status !== "rejected") {
    return fail("你已经报名该活动");
  }

  var spotsLeft = (activity.maxParticipants || 0) - (activity.acceptedCount || 0);
  var initialStatus;

  if (activity.approvalMode === "auto") {
    if (spotsLeft > 0) {
      initialStatus = "accepted";
    } else {
      initialStatus = "waitlisted";
    }
  } else {
    initialStatus = "pending";
  }

  // 如果之前有被拒绝的记录，允许重新申请
  if (existing) {
    existing.status = initialStatus;
    existing.message = data.message || "";
    existing.updatedAt = now();
    if (initialStatus === "accepted") {
      existing.confirmedAt = now();
    }
    if (initialStatus === "waitlisted") {
      activity.waitlistCount = (activity.waitlistCount || 0) + 1;
    }
    if (initialStatus === "accepted") {
      activity.acceptedCount = (activity.acceptedCount || 0) + 1;
    }
    activity.updatedAt = now();
    save();
    return ok(existing);
  }

  var application = {
    id: generateId(),
    activityId: data.activityId,
    applicantOpenid: openid,
    applicantNickname: user.nickname || "匿名书友",
    applicantCity: user.city || "",
    applicantReadingLevel: user.readingLevel || "",
    message: data.message || "",
    status: initialStatus,
    attendanceStatus: null,
    confirmedAt: initialStatus === "accepted" ? now() : null,
    reviewedAt: initialStatus === "accepted" ? now() : null,
    cancelledAt: null,
    cancelReason: "",
    createdAt: now(),
    updatedAt: now()
  };

  db.applications.push(application);

  if (initialStatus === "accepted") {
    activity.acceptedCount = (activity.acceptedCount || 0) + 1;
    // 检查是否满员
    if (activity.acceptedCount >= activity.maxParticipants) {
      activity.status = "matched";
    }
  }
  if (initialStatus === "waitlisted") {
    activity.waitlistCount = (activity.waitlistCount || 0) + 1;
  }

  activity.updatedAt = now();
  save();

  return ok(application);
}

// ============================================================
//  API: withdrawApplication
// ============================================================

function handleWithdrawApplication(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var application = findApplication(data.applicationId);
  if (!application) return fail("申请不存在");
  if (application.applicantOpenid !== openid) return fail("无权操作");
  if (application.status === "cancelled") return fail("已经取消");

  var activity = findActivity(application.activityId);

  // 记住之前的状态，用于判断是否需要重新开放活动
  var prevStatus = application.status;

  application.status = "cancelled";
  application.cancelledAt = now();
  application.cancelReason = data.reason || "用户主动取消";
  application.updatedAt = now();

  if (activity) {
    // 重新计算计数（会正确排除已取消的申请）
    recalcActivityCounts(activity);

    // 提升候补
    if (activity.acceptedCount < activity.maxParticipants) {
      promoteWaitlisted(activity);
    }

    // 如果之前是满员状态，重新开放
    if (activity.status === "matched" && activity.acceptedCount < activity.maxParticipants) {
      activity.status = "open";
    }

    activity.updatedAt = now();
  }

  save();
  return ok(application);
}

function recalcActivityCounts(activity) {
  var accepted = 0;
  var waitlisted = 0;
  var confirmed = 0;
  for (var i = 0; i < db.applications.length; i++) {
    var app = db.applications[i];
    if (app.activityId !== activity.id) continue;
    if (app.status === "accepted") {
      accepted++;
      if (app.attendanceStatus === "confirmed") confirmed++;
    }
    if (app.status === "waitlisted") waitlisted++;
  }
  activity.acceptedCount = accepted;
  activity.waitlistCount = waitlisted;
  activity.confirmedCount = confirmed;
}

function promoteWaitlisted(activity) {
  // 按创建时间排序候补申请
  var waitlisted = [];
  for (var i = 0; i < db.applications.length; i++) {
    var app = db.applications[i];
    if (app.activityId === activity.id && app.status === "waitlisted") {
      waitlisted.push(app);
    }
  }
  waitlisted.sort(function (a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  var spotsLeft = (activity.maxParticipants || 0) - activity.acceptedCount;
  for (var j = 0; j < waitlisted.length && spotsLeft > 0; j++) {
    waitlisted[j].status = "accepted";
    waitlisted[j].confirmedAt = now();
    waitlisted[j].reviewedAt = now();
    waitlisted[j].updatedAt = now();
    activity.acceptedCount++;
    activity.waitlistCount = Math.max(0, (activity.waitlistCount || 0) - 1);
    spotsLeft--;
  }
}

// ============================================================
//  API: confirmAttendance
// ============================================================

function handleConfirmAttendance(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var application = findApplication(data.applicationId);
  if (!application) return fail("申请不存在");
  if (application.applicantOpenid !== openid) return fail("无权操作");
  if (application.status !== "accepted") return fail("只有已通过的申请才能确认出席");

  application.attendanceStatus = "confirmed";
  application.updatedAt = now();

  var activity = findActivity(application.activityId);
  if (activity) {
    activity.confirmedCount = (activity.confirmedCount || 0) + 1;
    activity.updatedAt = now();
  }

  save();
  return ok(application);
}

// ============================================================
//  API: recommendations
// ============================================================

function buildFeedbackMap(openid) {
  var map = {};
  for (var i = 0; i < db.recommendationFeedback.length; i++) {
    var fb = db.recommendationFeedback[i];
    if (fb.openid === openid) {
      map[fb.activityId] = fb;
    }
  }
  return map;
}

function buildBlockedSet(openid) {
  var set = {};
  for (var i = 0; i < db.userBlocks.length; i++) {
    var block = db.userBlocks[i];
    if (block.blockerOpenid === openid) {
      set[block.blockedOpenid] = true;
    }
  }
  return set;
}

function handleRecommendations(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  // 附加位置信息用于距离计算
  if (data.latitude && data.longitude) {
    user._lat = data.latitude;
    user._lng = data.longitude;
  }

  var feedbackMap = buildFeedbackMap(openid);
  var blockedSet = buildBlockedSet(openid);

  var results = [];

  for (var i = 0; i < db.activities.length; i++) {
    var act = db.activities[i];
    if (act.status !== "open") continue;
    if (act.creatorOpenid === openid) continue;
    if (blockedSet[act.creatorOpenid]) continue;

    var scored = scoreActivityForUser(act, user, feedbackMap);
    if (scored.score <= 0) continue;

    results.push({
      activity: act,
      score: scored.score,
      matchLevel: scored.matchLevel,
      breakdown: scored.breakdown,
      aiExplain: scored.aiExplain
    });
  }

  // 排序: 先按 matchLevel (S > A > B > C > D)，再按 score
  var levelOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  results.sort(function (a, b) {
    var la = levelOrder[a.matchLevel] || 5;
    var lb = levelOrder[b.matchLevel] || 5;
    if (la !== lb) return la - lb;
    return b.score - a.score;
  });

  // 过滤器
  if (data.genre) {
    results = results.filter(function (r) { return r.activity.genre === data.genre; });
  }
  if (data.matchLevel) {
    var levels = data.matchLevel;
    if (typeof levels === "string") levels = [levels];
    results = results.filter(function (r) { return levels.indexOf(r.matchLevel) >= 0; });
  }
  if (data.city) {
    results = results.filter(function (r) { return r.activity.city === data.city; });
  }

  var limit = data.limit || 20;
  var offset = data.offset || 0;
  var total = results.length;
  results = results.slice(offset, offset + limit);

  return ok({
    list: results,
    total: total,
    offset: offset,
    limit: limit
  });
}

// ============================================================
//  API: getActivityDetail
// ============================================================

function handleGetActivityDetail(data) {
  var id = data.activityId || data.id;
  if (!id) return fail("缺少活动ID");
  load();
  var activity = findActivity(id);
  if (!activity) return fail("活动不存在");

  var creator = findUser(activity.creatorOpenid);
  var creatorProfile = null;
  if (creator) {
    creatorProfile = {
      openid: creator.openid,
      nickname: creator.nickname || "匿名书友",
      avatarUrl: creator.avatarUrl || "",
      city: creator.city || "",
      readingLevel: creator.readingLevel || "",
      trustScore: computeUserTrustScore(creator.openid)
    };
  }

  // 申请人列表
  var applicants = [];
  for (var i = 0; i < db.applications.length; i++) {
    var app = db.applications[i];
    if (app.activityId !== id) continue;
    applicants.push({
      id: app.id,
      applicantOpenid: app.applicantOpenid,
      applicantNickname: app.applicantNickname,
      applicantCity: app.applicantCity,
      applicantReadingLevel: app.applicantReadingLevel,
      message: app.message,
      status: app.status,
      attendanceStatus: app.attendanceStatus,
      createdAt: app.createdAt
    });
  }

  // 评价
  var reviews = [];
  for (var j = 0; j < db.matchReviews.length; j++) {
    var rev = db.matchReviews[j];
    if (rev.activityId === id) {
      reviews.push(rev);
    }
  }

  // 分享次数
  var shareCount = 0;
  for (var k = 0; k < db.activityShares.length; k++) {
    if (db.activityShares[k].activityId === id) shareCount++;
  }

  // 当前用户申请状态
  var myApplication = null;
  if (data.openid) {
    var myApp = findApplicationByPair(id, data.openid);
    if (myApp) {
      myApplication = {
        id: myApp.id,
        status: myApp.status,
        attendanceStatus: myApp.attendanceStatus
      };
    }
  }

  var result = shallowCopy(activity);
  result.creatorProfile = creatorProfile;
  result.applicants = applicants;
  result.reviews = reviews;
  result.shareCount = shareCount;
  result.myApplication = myApplication;

  return ok(result);
}

// ============================================================
//  API: reviewApplication
// ============================================================

function handleReviewApplication(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var application = findApplication(data.applicationId);
  if (!application) return fail("申请不存在");

  var activity = findActivity(application.activityId);
  if (!activity) return fail("活动不存在");
  if (activity.creatorOpenid !== openid) return fail("无权操作");

  var decision = data.decision; // "accepted" or "rejected"
  if (decision !== "accepted" && decision !== "rejected") {
    return fail("无效的审核决定");
  }

  if (decision === "accepted") {
    // 容量检查
    if (activity.acceptedCount >= activity.maxParticipants) {
      return fail("名额已满");
    }

    var prevStatus = application.status;
    application.status = "accepted";
    application.confirmedAt = now();
    activity.acceptedCount = (activity.acceptedCount || 0) + 1;

    // 如果之前是候补，减少候补计数
    if (prevStatus === "waitlisted") {
      activity.waitlistCount = Math.max(0, (activity.waitlistCount || 0) - 1);
    }

    // 检查是否满员
    if (activity.acceptedCount >= activity.maxParticipants) {
      activity.status = "matched";
    }
  } else {
    application.status = "rejected";
  }

  application.reviewedAt = now();
  application.updatedAt = now();
  activity.updatedAt = now();

  save();
  return ok(application);
}

// ============================================================
//  API: recordRecommendationFeedback
// ============================================================

function handleRecordRecommendationFeedback(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var existing = null;
  for (var i = 0; i < db.recommendationFeedback.length; i++) {
    var fb = db.recommendationFeedback[i];
    if (fb.openid === openid && fb.activityId === data.activityId) {
      existing = fb;
      break;
    }
  }

  if (existing) {
    existing.feedback = data.feedback; // interested / not_interested / hidden
    existing.updatedAt = now();
  } else {
    db.recommendationFeedback.push({
      id: generateId(),
      openid: openid,
      activityId: data.activityId,
      feedback: data.feedback,
      score: data.score || 0,
      matchLevel: data.matchLevel || "",
      createdAt: now(),
      updatedAt: now()
    });
  }

  save();
  return ok({ recorded: true });
}

// ============================================================
//  API: recordActivityShare
// ============================================================

function handleRecordActivityShare(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  db.activityShares.push({
    id: generateId(),
    activityId: data.activityId,
    openid: openid,
    channel: data.channel || "wechat",
    createdAt: now()
  });

  save();
  return ok({ recorded: true });
}

// ============================================================
//  API: blockActivityCreator
// ============================================================

function handleBlockActivityCreator(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var targetOpenid = data.creatorOpenid;
  if (!targetOpenid) return fail("缺少目标用户");
  if (targetOpenid === openid) return fail("不能屏蔽自己");

  // 检查是否已屏蔽
  for (var i = 0; i < db.userBlocks.length; i++) {
    var b = db.userBlocks[i];
    if (b.blockerOpenid === openid && b.blockedOpenid === targetOpenid) {
      return fail("已经屏蔽该用户");
    }
  }

  db.userBlocks.push({
    id: generateId(),
    blockerOpenid: openid,
    blockedOpenid: targetOpenid,
    createdAt: now()
  });

  // 取消该发起人所有活动的当前用户申请
  for (var j = 0; j < db.applications.length; j++) {
    var app = db.applications[j];
    if (app.applicantOpenid === openid && app.status === "pending") {
      var act = findActivity(app.activityId);
      if (act && act.creatorOpenid === targetOpenid) {
        app.status = "cancelled";
        app.cancelReason = "用户屏蔽了发起人";
        app.cancelledAt = now();
        app.updatedAt = now();
      }
    }
  }

  save();
  return ok({ blocked: true });
}

// ============================================================
//  API: submitMatchReview
// ============================================================

function handleSubmitMatchReview(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var activityId = data.activityId;
  var activity = findActivity(activityId);
  if (!activity) return fail("活动不存在");

  // 确认用户参加了此活动
  var isParticipant = false;
  var isCreator = (activity.creatorOpenid === openid);

  if (isCreator) {
    isParticipant = true;
  } else {
    for (var i = 0; i < db.applications.length; i++) {
      var app = db.applications[i];
      if (app.activityId === activityId && app.applicantOpenid === openid && app.status === "accepted") {
        isParticipant = true;
        break;
      }
    }
  }
  if (!isParticipant) return fail("你未参加该活动");

  // 检查是否已评价
  for (var j = 0; j < db.matchReviews.length; j++) {
    var existing = db.matchReviews[j];
    if (existing.activityId === activityId && existing.reviewerOpenid === openid) {
      return fail("你已经评价过该活动");
    }
  }

  var targetOpenid = data.targetOpenid || activity.creatorOpenid;

  var review = {
    id: generateId(),
    activityId: activityId,
    reviewerOpenid: openid,
    targetOpenid: targetOpenid,
    punctuality: data.punctuality || 3,
    focus: data.focus || 3,
    discussion: data.discussion || 3,
    preparation: data.preparation || 3,
    relativeScore: data.relativeScore || 3,
    comment: data.comment || "",
    createdAt: now()
  };

  db.matchReviews.push(review);
  save();

  return ok(review);
}

// ============================================================
//  API: getMatchRatingProfile
// ============================================================

function handleGetMatchRatingProfile(data) {
  var openid = data.targetOpenid || data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var reviews = [];
  for (var i = 0; i < db.matchReviews.length; i++) {
    if (db.matchReviews[i].targetOpenid === openid) {
      reviews.push(db.matchReviews[i]);
    }
  }

  if (reviews.length === 0) {
    return ok({
      totalReviews: 0,
      avgPunctuality: 0,
      avgFocus: 0,
      avgDiscussion: 0,
      avgPreparation: 0,
      avgRelativeScore: 0,
      avgOverall: 0,
      recentComments: []
    });
  }

  var sumP = 0, sumF = 0, sumD = 0, sumPr = 0, sumR = 0;
  for (var j = 0; j < reviews.length; j++) {
    sumP += reviews[j].punctuality || 3;
    sumF += reviews[j].focus || 3;
    sumD += reviews[j].discussion || 3;
    sumPr += reviews[j].preparation || 3;
    sumR += reviews[j].relativeScore || 3;
  }
  var n = reviews.length;
  var avgP = sumP / n;
  var avgF = sumF / n;
  var avgD = sumD / n;
  var avgPr = sumPr / n;
  var avgR = sumR / n;
  var avgOverall = (avgP + avgF + avgD + avgPr + avgR) / 5;

  // 最近 5 条评论
  reviews.sort(function (a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  var recentComments = [];
  for (var k = 0; k < Math.min(reviews.length, 5); k++) {
    if (reviews[k].comment) {
      recentComments.push({
        comment: reviews[k].comment,
        createdAt: reviews[k].createdAt,
        reviewerOpenid: reviews[k].reviewerOpenid
      });
    }
  }

  return ok({
    totalReviews: n,
    avgPunctuality: Math.round(avgP * 10) / 10,
    avgFocus: Math.round(avgF * 10) / 10,
    avgDiscussion: Math.round(avgD * 10) / 10,
    avgPreparation: Math.round(avgPr * 10) / 10,
    avgRelativeScore: Math.round(avgR * 10) / 10,
    avgOverall: Math.round(avgOverall * 10) / 10,
    recentComments: recentComments
  });
}

// ============================================================
//  API: getReliabilityProfile
// ============================================================

function handleGetReliabilityProfile(data) {
  var openid = data.targetOpenid || data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  var trustScore = computeUserTrustScore(openid);

  // 创建活动统计
  var createdTotal = 0;
  var createdCancelled = 0;
  var createdCompleted = 0;
  for (var i = 0; i < db.activities.length; i++) {
    var act = db.activities[i];
    if (act.creatorOpenid !== openid) continue;
    createdTotal++;
    if (act.status === "cancelled") createdCancelled++;
    if (act.status === "closed") createdCompleted++;
  }

  // 参与统计
  var participatedTotal = 0;
  var participatedConfirmed = 0;
  var participatedNoShow = 0;
  for (var j = 0; j < db.applications.length; j++) {
    var app = db.applications[j];
    if (app.applicantOpenid !== openid) continue;
    if (app.status === "accepted") {
      participatedTotal++;
      if (app.attendanceStatus === "confirmed") participatedConfirmed++;
    }
    if (app.status === "cancelled" && app.confirmedAt) {
      participatedNoShow++;
    }
  }

  // 评价统计
  var ratingProfile = handleGetMatchRatingProfile({ openid: openid });

  // 被举报次数
  var reportCount = 0;
  for (var k = 0; k < db.reports.length; k++) {
    if (db.reports[k].targetOpenid === openid) reportCount++;
  }

  return ok({
    trustScore: trustScore,
    profileCompletion: user.profileCompletion || 0,
    activities: {
      created: createdTotal,
      cancelled: createdCancelled,
      completed: createdCompleted,
      cancelRate: createdTotal > 0 ? Math.round(createdCancelled / createdTotal * 100) : 0
    },
    participation: {
      total: participatedTotal,
      confirmed: participatedConfirmed,
      noShow: participatedNoShow,
      confirmRate: participatedTotal > 0 ? Math.round(participatedConfirmed / participatedTotal * 100) : 0
    },
    rating: ratingProfile.ok ? ratingProfile.data : null,
    reportCount: reportCount
  });
}

// ============================================================
//  API: getAiProfile
// ============================================================

function handleGetAiProfile(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  incrementAiUsage();

  var insight = mockAiProfileInsight(user);

  // 阅读行为统计
  var genresParticipated = {};
  for (var i = 0; i < db.applications.length; i++) {
    var app = db.applications[i];
    if (app.applicantOpenid !== openid) continue;
    if (app.status !== "accepted" && app.status !== "waitlisted") continue;
    var act = findActivity(app.activityId);
    if (act) {
      genresParticipated[act.genre] = (genresParticipated[act.genre] || 0) + 1;
    }
  }

  var topGenres = [];
  var genreKeys = Object.keys(genresParticipated);
  for (var j = 0; j < genreKeys.length; j++) {
    topGenres.push({
      genre: genreKeys[j],
      genreLabel: GENRE_LABELS[genreKeys[j]] || genreKeys[j],
      count: genresParticipated[genreKeys[j]]
    });
  }
  topGenres.sort(function (a, b) { return b.count - a.count; });

  return ok({
    personaTags: insight.personaTags,
    summary: insight.summary,
    suggestions: insight.suggestions,
    topGenres: topGenres.slice(0, 5),
    readingDiversity: genreKeys.length,
    profileCompletion: user.profileCompletion || 0
  });
}

// ============================================================
//  API: createMatchIntent
// ============================================================

function handleCreateMatchIntent(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();
  var user = findUser(openid);
  if (!user) return fail("用户不存在");

  var genre = data.genre;
  var city = data.city || user.city;
  var district = data.district || user.district;
  var timeSlot = data.timeSlot;

  if (!genre) return fail("请选择书籍类型");
  if (!timeSlot) return fail("请选择时间档");

  // 去重: 24h 内同 genre+city+district+timeSlot 不重复创建
  for (var i = 0; i < db.matchIntents.length; i++) {
    var existing = db.matchIntents[i];
    if (existing.openid === openid &&
        existing.genre === genre &&
        existing.city === city &&
        existing.district === district &&
        existing.timeSlot === timeSlot) {
      var age = hoursBetween(existing.createdAt, now());
      if (age < 24) {
        return ok(existing);
      }
    }
  }

  var intent = {
    id: generateId(),
    openid: openid,
    genre: genre,
    city: city || "",
    district: district || "",
    timeSlot: timeSlot,
    createdAt: now(),
    expiresAt: futureISO(72) // 72 小时有效
  };

  db.matchIntents.push(intent);
  save();

  return ok(intent);
}

// ============================================================
//  API: listIntentPools
// ============================================================

function handleListIntentPools(data) {
  load();

  // 清理过期意向
  var currentTs = now();
  db.matchIntents = db.matchIntents.filter(function (intent) {
    return new Date(intent.expiresAt).getTime() > new Date(currentTs).getTime();
  });

  // 聚合: genre + city + district + timeSlot
  var poolMap = {};
  for (var i = 0; i < db.matchIntents.length; i++) {
    var intent = db.matchIntents[i];
    var key = intent.genre + "|" + intent.city + "|" + (intent.district || "") + "|" + intent.timeSlot;
    if (!poolMap[key]) {
      poolMap[key] = {
        genre: intent.genre,
        genreLabel: GENRE_LABELS[intent.genre] || intent.genre,
        city: intent.city,
        district: intent.district || "",
        timeSlot: intent.timeSlot,
        timeSlotLabel: SLOT_LABELS[intent.timeSlot] || intent.timeSlot,
        count: 0,
        openids: []
      };
    }
    poolMap[key].count++;
    poolMap[key].openids.push(intent.openid);
  }

  var pools = [];
  var keys = Object.keys(poolMap);
  for (var j = 0; j < keys.length; j++) {
    pools.push(poolMap[keys[j]]);
  }

  // 过滤
  if (data.city) {
    pools = pools.filter(function (p) { return p.city === data.city; });
  }
  if (data.genre) {
    pools = pools.filter(function (p) { return p.genre === data.genre; });
  }

  // 按人数排序
  pools.sort(function (a, b) { return b.count - a.count; });

  save();
  return ok(pools);
}

// ============================================================
//  API: getOpsQueue
// ============================================================

function handleGetOpsQueue(data) {
  load();

  var queue = [];

  // 1. 待审核的活动 (needs_review)
  for (var i = 0; i < db.activities.length; i++) {
    var act = db.activities[i];
    if (act.auditStatus === "needs_review") {
      queue.push({
        type: "activity_review",
        priority: "high",
        id: act.id,
        title: "审核活动: " + act.title,
        detail: act,
        aiModeration: act.aiModeration,
        createdAt: act.createdAt
      });
    }
  }

  // 2. 未处理的举报
  for (var j = 0; j < db.reports.length; j++) {
    var report = db.reports[j];
    if (report.status === "pending") {
      queue.push({
        type: "report",
        priority: report.aiTriage ? report.aiTriage.priority : "medium",
        id: report.id,
        title: "处理举报: " + (report.category || "未知类型"),
        detail: report,
        aiTriage: report.aiTriage,
        createdAt: report.createdAt
      });
    }
  }

  // 3. 被屏蔽的内容 (blocked 活动)
  for (var k = 0; k < db.activities.length; k++) {
    var blockedAct = db.activities[k];
    if (blockedAct.auditStatus === "blocked") {
      queue.push({
        type: "blocked_activity",
        priority: "medium",
        id: blockedAct.id,
        title: "已屏蔽活动复核: " + blockedAct.title,
        detail: blockedAct,
        createdAt: blockedAct.createdAt
      });
    }
  }

  // 按优先级排序: high > medium > low
  var priorityOrder = { high: 0, medium: 1, low: 2 };
  queue.sort(function (a, b) {
    var pa = priorityOrder[a.priority] || 3;
    var pb = priorityOrder[b.priority] || 3;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return ok(queue);
}

// ============================================================
//  API: getOpsFunnel
// ============================================================

function handleGetOpsFunnel(data) {
  load();

  var totalActivities = db.activities.length;
  var openActivities = 0;
  var matchedActivities = 0;
  var cancelledActivities = 0;
  var closedActivities = 0;

  for (var i = 0; i < db.activities.length; i++) {
    var status = db.activities[i].status;
    if (status === "open") openActivities++;
    else if (status === "matched") matchedActivities++;
    else if (status === "cancelled") cancelledActivities++;
    else if (status === "closed") closedActivities++;
  }

  var totalApplications = db.applications.length;
  var acceptedApplications = 0;
  var pendingApplications = 0;
  var rejectedApplications = 0;
  var waitlistedApplications = 0;
  var cancelledApplications = 0;

  for (var j = 0; j < db.applications.length; j++) {
    var aStatus = db.applications[j].status;
    if (aStatus === "accepted") acceptedApplications++;
    else if (aStatus === "pending") pendingApplications++;
    else if (aStatus === "rejected") rejectedApplications++;
    else if (aStatus === "waitlisted") waitlistedApplications++;
    else if (aStatus === "cancelled") cancelledApplications++;
  }

  var totalUsers = db.users.length;
  var activeUsers = 0;
  for (var k = 0; k < db.users.length; k++) {
    if (db.users[k].identityStatus === "active") activeUsers++;
  }

  return ok({
    activities: {
      total: totalActivities,
      open: openActivities,
      matched: matchedActivities,
      cancelled: cancelledActivities,
      closed: closedActivities,
      matchRate: totalActivities > 0 ? Math.round(matchedActivities / totalActivities * 100) : 0
    },
    applications: {
      total: totalApplications,
      accepted: acceptedApplications,
      pending: pendingApplications,
      rejected: rejectedApplications,
      waitlisted: waitlistedApplications,
      cancelled: cancelledApplications,
      acceptRate: totalApplications > 0 ? Math.round(acceptedApplications / totalApplications * 100) : 0
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      activeRate: totalUsers > 0 ? Math.round(activeUsers / totalUsers * 100) : 0
    },
    reports: {
      total: db.reports.length,
      pending: db.reports.filter(function (r) { return r.status === "pending"; }).length,
      resolved: db.reports.filter(function (r) { return r.status !== "pending"; }).length
    },
    reviews: db.matchReviews.length,
    shares: db.activityShares.length,
    intents: db.matchIntents.length
  });
}

// ============================================================
//  API: getCityOpsSummary
// ============================================================

function handleGetCityOpsSummary(data) {
  load();

  var cityMap = {};
  var cities = Object.keys(CITY_DISTRICTS);

  for (var c = 0; c < cities.length; c++) {
    cityMap[cities[c]] = {
      city: cities[c],
      userCount: 0,
      activityCount: 0,
      openActivityCount: 0,
      matchedActivityCount: 0,
      applicationCount: 0,
      acceptedCount: 0,
      intentCount: 0,
      reportCount: 0
    };
  }

  for (var i = 0; i < db.users.length; i++) {
    var city = db.users[i].city;
    if (cityMap[city]) cityMap[city].userCount++;
  }

  for (var j = 0; j < db.activities.length; j++) {
    var act = db.activities[j];
    if (!cityMap[act.city]) continue;
    cityMap[act.city].activityCount++;
    if (act.status === "open") cityMap[act.city].openActivityCount++;
    if (act.status === "matched") cityMap[act.city].matchedActivityCount++;
  }

  for (var k = 0; k < db.applications.length; k++) {
    var app = db.applications[k];
    var act2 = findActivity(app.activityId);
    if (act2 && cityMap[act2.city]) {
      cityMap[act2.city].applicationCount++;
      if (app.status === "accepted") cityMap[act2.city].acceptedCount++;
    }
  }

  for (var m = 0; m < db.matchIntents.length; m++) {
    var intent = db.matchIntents[m];
    if (cityMap[intent.city]) cityMap[intent.city].intentCount++;
  }

  for (var n = 0; n < db.reports.length; n++) {
    var report = db.reports[n];
    var reportedUser = findUser(report.targetOpenid);
    if (reportedUser && cityMap[reportedUser.city]) {
      cityMap[reportedUser.city].reportCount++;
    }
  }

  var result = [];
  for (var p = 0; p < cities.length; p++) {
    result.push(cityMap[cities[p]]);
  }
  result.sort(function (a, b) { return b.activityCount - a.activityCount; });

  return ok(result);
}

// ============================================================
//  API: getMyApplications
// ============================================================

function handleGetMyApplications(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var results = [];
  for (var i = 0; i < db.applications.length; i++) {
    var app = db.applications[i];
    if (app.applicantOpenid !== openid) continue;

    var activity = findActivity(app.activityId);
    results.push({
      id: app.id,
      activityId: app.activityId,
      status: app.status,
      attendanceStatus: app.attendanceStatus,
      message: app.message,
      confirmedAt: app.confirmedAt,
      reviewedAt: app.reviewedAt,
      cancelledAt: app.cancelledAt,
      cancelReason: app.cancelReason,
      createdAt: app.createdAt,
      activity: activity ? {
        id: activity.id,
        title: activity.title,
        genre: activity.genre,
        city: activity.city,
        district: activity.district,
        startAt: activity.startAt,
        endAt: activity.endAt,
        locationName: activity.locationName,
        status: activity.status,
        creatorOpenid: activity.creatorOpenid,
        maxParticipants: activity.maxParticipants,
        acceptedCount: activity.acceptedCount
      } : null
    });
  }

  // 按创建时间倒序
  results.sort(function (a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // 状态过滤
  if (data.status) {
    var statusFilter = data.status;
    if (typeof statusFilter === "string") statusFilter = [statusFilter];
    results = results.filter(function (r) { return statusFilter.indexOf(r.status) >= 0; });
  }

  return ok(results);
}

// ============================================================
//  API: getMyCreated
// ============================================================

function handleGetMyCreated(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var results = [];
  for (var i = 0; i < db.activities.length; i++) {
    var act = db.activities[i];
    if (act.creatorOpenid !== openid) continue;

    // 统计申请数
    var pendingCount = 0;
    var acceptedCount = 0;
    var waitlistedCount = 0;
    var totalApplications = 0;

    for (var j = 0; j < db.applications.length; j++) {
      var app = db.applications[j];
      if (app.activityId !== act.id) continue;
      totalApplications++;
      if (app.status === "pending") pendingCount++;
      else if (app.status === "accepted") acceptedCount++;
      else if (app.status === "waitlisted") waitlistedCount++;
    }

    results.push({
      id: act.id,
      title: act.title,
      genre: act.genre,
      city: act.city,
      district: act.district,
      startAt: act.startAt,
      endAt: act.endAt,
      locationName: act.locationName,
      status: act.status,
      maxParticipants: act.maxParticipants,
      auditStatus: act.auditStatus,
      aiScore: act.aiScore,
      acceptedCount: acceptedCount,
      pendingCount: pendingCount,
      waitlistedCount: waitlistedCount,
      totalApplications: totalApplications,
      createdAt: act.createdAt,
      updatedAt: act.updatedAt
    });
  }

  // 按创建时间倒序
  results.sort(function (a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // 状态过滤
  if (data.status) {
    var statusFilter = data.status;
    if (typeof statusFilter === "string") statusFilter = [statusFilter];
    results = results.filter(function (r) { return statusFilter.indexOf(r.status) >= 0; });
  }

  return ok(results);
}

// ============================================================
//  API: createReport
// ============================================================

function handleCreateReport(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var targetOpenid = data.targetOpenid;
  if (!targetOpenid) return fail("缺少举报目标");
  if (targetOpenid === openid) return fail("不能举报自己");

  var report = {
    id: generateId(),
    reporterOpenid: openid,
    targetOpenid: targetOpenid,
    activityId: data.activityId || null,
    category: data.category || "other",
    reason: data.reason || "",
    evidence: data.evidence || [],
    status: "pending",
    aiTriage: null,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: now(),
    updatedAt: now()
  };

  // AI 分流
  report.aiTriage = mockAiReportTriage(report);

  db.reports.push(report);
  save();

  return ok(report);
}

// ============================================================
//  API: resolveReport
// ============================================================

function handleResolveReport(data) {
  load();
  var report = null;
  for (var i = 0; i < db.reports.length; i++) {
    if (db.reports[i].id === data.reportId) {
      report = db.reports[i];
      break;
    }
  }
  if (!report) return fail("举报不存在");

  report.status = data.resolution || "resolved";
  report.resolvedAt = now();
  report.resolvedBy = data.resolvedBy || "system";
  report.resolutionNote = data.note || "";
  report.updatedAt = now();

  save();
  return ok(report);
}

// ============================================================
//  API: resolveActivityReview
// ============================================================

function handleResolveActivityReview(data) {
  load();
  var activity = findActivity(data.activityId);
  if (!activity) return fail("活动不存在");

  activity.auditStatus = data.decision || "auto_passed";
  activity.updatedAt = now();

  // 如果被标记为 blocked 并且决定通过，改为 open
  if (activity.status === "cancelled" && data.decision === "auto_passed" && data.reopen) {
    activity.status = "open";
  }

  save();
  return ok(activity);
}

// ============================================================
//  API: searchPlaces (透传)
// ============================================================

function handleSearchPlaces(data) {
  // 直接返回 mock 地点数据
  var keyword = data.keyword || "";
  var city = data.city || "北京";

  var mockPlaces = [
    {
      id: "place_001",
      name: city + "市图书馆",
      address: city + "市文化中心A座",
      longitude: 116.40 + Math.random() * 0.1,
      latitude: 39.90 + Math.random() * 0.1,
      label: city + "市图书馆 (市文化中心A座)"
    },
    {
      id: "place_002",
      name: "星巴克咖啡(大学路店)",
      address: city + "市大学路88号",
      longitude: 116.41 + Math.random() * 0.1,
      latitude: 39.91 + Math.random() * 0.1,
      label: "星巴克咖啡(大学路店) (大学路88号)"
    },
    {
      id: "place_003",
      name: "西西弗书店",
      address: city + "市商业广场B1层",
      longitude: 116.42 + Math.random() * 0.1,
      latitude: 39.92 + Math.random() * 0.1,
      label: "西西弗书店 (商业广场B1层)"
    },
    {
      id: "place_004",
      name: "字里行间书店",
      address: city + "市创意园区3号楼",
      longitude: 116.39 + Math.random() * 0.1,
      latitude: 39.89 + Math.random() * 0.1,
      label: "字里行间书店 (创意园区3号楼)"
    },
    {
      id: "place_005",
      name: "漫咖啡",
      address: city + "市花园路12号",
      longitude: 116.43 + Math.random() * 0.1,
      latitude: 39.93 + Math.random() * 0.1,
      label: "漫咖啡 (花园路12号)"
    }
  ];

  // 按关键词过滤
  if (keyword) {
    mockPlaces = mockPlaces.filter(function (p) {
      return p.name.indexOf(keyword) >= 0 || p.address.indexOf(keyword) >= 0;
    });
    if (mockPlaces.length === 0) {
      mockPlaces.push({
        id: "place_match_001",
        name: keyword + " (搜索结果)",
        address: city + "市中心区域",
        longitude: 116.40 + Math.random() * 0.1,
        latitude: 39.90 + Math.random() * 0.1,
        label: keyword + " (" + city + "市中心区域)"
      });
    }
  }

  return ok(mockPlaces);
}

// ============================================================
//  API: aiAssist
// ============================================================

function handleAiAssist(data) {
  var openid = data.openid;
  if (!openid) return fail("缺少 openid");
  load();

  var task = data.task;
  var usage = getAiUsageToday();
  if (usage.count >= usage.limit) {
    return fail("今日 AI 使用次数已达上限 (" + usage.limit + "次)");
  }

  incrementAiUsage();

  var result;

  switch (task) {
    case "activity_draft":
      result = mockAiActivityDraft(data);
      break;

    case "profile_insight":
      var user = findUser(openid);
      result = user ? mockAiProfileInsight(user) : { personaTags: [], summary: "请先完善个人资料", suggestions: [] };
      break;

    case "match_explain":
      result = {
        explanation: mockAiMatchExplain(data.breakdown || {}),
        tips: [
          "提前阅读相关章节，讨论时更有深度",
          "准备1-2个问题，活跃讨论气氛",
          "准时到达，展现对书友的尊重"
        ]
      };
      break;

    case "activity_summary":
      result = {
        summary: "本次活动共" + (data.participantCount || 6) + "人参加，围绕" +
          (data.genre ? GENRE_LABELS[data.genre] : "精彩书籍") + "展开了深入讨论。" +
          "书友们积极参与，气氛融洽，建议继续保持定期组织。",
        highlights: [
          "讨论话题引发了深入思考",
          "参与者准备充分",
          "活动时间安排合理"
        ]
      };
      break;

    case "book_recommendation":
      var genres = data.preferredGenres || ["literature"];
      var bookRecs = {
        literature: [
          { title: "百年孤独", author: "加西亚·马尔克斯", reason: "魔幻现实主义经典，适合深度讨论" },
          { title: "人间失格", author: "太宰治", reason: "日本文学代表作，引发关于人性的思考" },
          { title: "月亮与六便士", author: "毛姆", reason: "探讨理想与现实的经典之作" }
        ],
        business: [
          { title: "从零到一", author: "彼得·蒂尔", reason: "创业思维的经典之作" },
          { title: "思考，快与慢", author: "丹尼尔·卡尼曼", reason: "理解决策心理的必读书" },
          { title: "创新者的窘境", author: "克莱顿·克里斯坦森", reason: "商业创新的底层逻辑" }
        ],
        tech: [
          { title: "人月神话", author: "弗雷德里克·布鲁克斯", reason: "软件工程的经典著作" },
          { title: "黑客与画家", author: "保罗·格雷厄姆", reason: "技术与创造力的深度思考" },
          { title: "浪潮之巅", author: "吴军", reason: "科技产业发展全景" }
        ],
        history: [
          { title: "人类简史", author: "尤瓦尔·赫拉利", reason: "宏大视角的人类发展史" },
          { title: "万历十五年", author: "黄仁宇", reason: "以小见大的历史叙事" },
          { title: "枪炮、病菌与钢铁", author: "贾雷德·戴蒙德", reason: "文明演进的跨学科解读" }
        ],
        psychology: [
          { title: "被讨厌的勇气", author: "岸见一郎", reason: "阿德勒心理学的通俗解读" },
          { title: "心流", author: "米哈里·契克森米哈赖", reason: "理解最佳体验状态的心理学" },
          { title: "非暴力沟通", author: "马歇尔·卢森堡", reason: "改善人际关系的实用工具" }
        ],
        philosophy: [
          { title: "苏菲的世界", author: "乔斯坦·贾德", reason: "哲学入门的最佳读物" },
          { title: "存在主义咖啡馆", author: "莎拉·贝克韦尔", reason: "存在主义哲学的生动叙述" },
          { title: "中国哲学简史", author: "冯友兰", reason: "中国哲学思想的精华概览" }
        ],
        self_help: [
          { title: "原子习惯", author: "詹姆斯·克利尔", reason: "建立好习惯的科学方法" },
          { title: "深度工作", author: "卡尔·纽波特", reason: "在碎片化时代保持专注" },
          { title: "刻意练习", author: "安德斯·艾利克森", reason: "从新手到大师的方法论" }
        ],
        art: [
          { title: "艺术的故事", author: "贡布里希", reason: "西方艺术史的经典入门" },
          { title: "设计中的设计", author: "原研哉", reason: "日本设计大师的设计哲学" },
          { title: "写给大家看的设计书", author: "罗宾·威廉姆斯", reason: "设计四大原则的通俗讲解" }
        ],
        scifi: [
          { title: "三体", author: "刘慈欣", reason: "中国科幻的里程碑之作" },
          { title: "基地", author: "阿西莫夫", reason: "科幻史诗的经典之作" },
          { title: "神经漫游者", author: "威廉·吉布森", reason: "赛博朋克流派的开山之作" }
        ],
        biography: [
          { title: "史蒂夫·乔布斯传", author: "沃尔特·艾萨克森", reason: "创新者的传奇人生" },
          { title: "苏东坡传", author: "林语堂", reason: "中国文人的精彩画像" },
          { title: "曾国藩传", author: "张宏杰", reason: "晚清重臣的成长之路" }
        ],
        education: [
          { title: "如何阅读一本书", author: "莫提默·艾德勒", reason: "阅读方法论的经典" },
          { title: "学习之道", author: "芭芭拉·奥克利", reason: "高效学习的科学方法" },
          { title: "刻意学习", author: "Scalers", reason: "持续学习的行动指南" }
        ]
      };
      var allRecs = [];
      for (var gi = 0; gi < genres.length; gi++) {
        var recs = bookRecs[genres[gi]] || bookRecs.literature;
        for (var ri = 0; ri < recs.length; ri++) {
          allRecs.push(recs[ri]);
        }
      }
      result = { books: allRecs };
      break;

    case "discussion_questions":
      result = {
        questions: [
          "这本书最让你印象深刻的段落或场景是什么？",
          "如果你是书中的主角，你会做出不同的选择吗？",
          "书中表达的观点在当今社会还适用吗？",
          "你会向什么样的朋友推荐这本书？",
          "阅读这本书的过程中，你有什么意想不到的收获？"
        ]
      };
      break;

    default:
      return fail("未知的 AI 任务: " + task);
  }

  // 缓存结果
  db.aiCache.push({
    id: generateId(),
    openid: openid,
    task: task,
    input: data,
    output: result,
    createdAt: now()
  });
  // 限制缓存大小
  if (db.aiCache.length > 200) {
    db.aiCache = db.aiCache.slice(-100);
  }

  save();
  return ok(result);
}

// ============================================================
//  API: seedDemoScenario
// ============================================================

function handleSeedDemoScenario(data) {
  load();

  // 清空现有数据
  db = defaultDB();

  // --- 生成 5 个 Demo 用户 ---
  var demoUsers = [
    {
      openid: "demo_user_current",
      nickname: "小书虫",
      avatarUrl: "",
      city: "北京",
      district: "朝阳区",
      readingLevel: "intermediate",
      preferredGenres: ["literature", "psychology", "philosophy"],
      availableSlots: ["weekend_morning", "weekend_afternoon", "weekday_evening"],
      bio: "热爱文学和哲学，喜欢在周末的午后泡一杯咖啡读书。相信阅读是一种生活方式。",
      identityStatus: "active",
      profileCompletion: 100,
      createdAt: pastISO(720),
      updatedAt: pastISO(24)
    },
    {
      openid: "demo_user_02",
      nickname: "商业观察家",
      avatarUrl: "",
      city: "北京",
      district: "海淀区",
      readingLevel: "advanced",
      preferredGenres: ["business", "tech", "biography"],
      availableSlots: ["weekday_evening", "weekend_afternoon"],
      bio: "互联网从业者，关注商业模式创新和科技趋势。每周至少读一本书。",
      identityStatus: "active",
      profileCompletion: 100,
      createdAt: pastISO(600),
      updatedAt: pastISO(48)
    },
    {
      openid: "demo_user_03",
      nickname: "历史控",
      avatarUrl: "",
      city: "北京",
      district: "东城区",
      readingLevel: "intermediate",
      preferredGenres: ["history", "biography", "philosophy"],
      availableSlots: ["weekend_morning", "weekend_afternoon", "weekend_evening"],
      bio: "历史系研究生在读，喜欢从历史中寻找当下的答案。",
      identityStatus: "active",
      profileCompletion: 100,
      createdAt: pastISO(500),
      updatedAt: pastISO(72)
    },
    {
      openid: "demo_user_04",
      nickname: "科幻旅者",
      avatarUrl: "",
      city: "上海",
      district: "徐汇区",
      readingLevel: "beginner",
      preferredGenres: ["scifi", "tech", "art"],
      availableSlots: ["weekday_evening", "weekend_evening"],
      bio: "科幻爱好者，喜欢探索想象力边界。也爱看设计类书籍。",
      identityStatus: "active",
      profileCompletion: 88,
      createdAt: pastISO(400),
      updatedAt: pastISO(96)
    },
    {
      openid: "demo_user_05",
      nickname: "成长型选手",
      avatarUrl: "",
      city: "北京",
      district: "朝阳区",
      readingLevel: "beginner",
      preferredGenres: ["self_help", "psychology", "business"],
      availableSlots: ["weekday_morning", "weekend_morning"],
      bio: "正在养成阅读习惯，希望通过读书活动认识更多爱学习的朋友。",
      identityStatus: "active",
      profileCompletion: 100,
      createdAt: pastISO(300),
      updatedAt: pastISO(12)
    }
  ];

  for (var u = 0; u < demoUsers.length; u++) {
    db.users.push(demoUsers[u]);
  }

  // --- 生成 4 个 Demo 活动 ---
  var demoActivities = [
    {
      id: generateId(),
      creatorOpenid: "demo_user_02",
      title: "《从零到一》线下读书分享会",
      genre: "business",
      description: "本次共读活动围绕彼得·蒂尔的《从零到一》展开。这本书探讨了如何创建创新企业的核心方法论，包括垄断思维、逆向思考等关键概念。无论你是创业者、产品经理还是对商业创新感兴趣的人，都能从这本书中获得启发。活动形式为先自由阅读30分钟，再围绕核心议题进行圆桌讨论。",
      city: "北京",
      district: "海淀区",
      locationName: "海淀区图书馆",
      locationAddress: "北京市海淀区中关村大街27号",
      latitude: 39.983,
      longitude: 116.316,
      startAt: futureISO(48),
      endAt: futureISO(51),
      maxParticipants: 8,
      readingLevel: "all",
      bookMode: "bring_own",
      format: "offline",
      discussionTopic: "如何理解蒂尔所说的'从0到1'与'从1到N'的区别？在你所在的行业中，有哪些'从0到1'的机会？",
      creatorTrustScore: 82,
      approvalMode: "manual",
      auditStatus: "auto_passed",
      aiModeration: { verdict: "auto_passed", reasons: [] },
      aiScore: 88,
      status: "open",
      acceptedCount: 2,
      waitlistCount: 0,
      confirmedCount: 1,
      createdAt: pastISO(120),
      updatedAt: pastISO(24)
    },
    {
      id: generateId(),
      creatorOpenid: "demo_user_03",
      title: "《万历十五年》深度共读会",
      genre: "history",
      description: "黄仁宇的《万历十五年》以1587年为切入点，剖析了明朝中后期的政治困境与社会矛盾。本次共读将深入讨论'大历史观'的解读方法，以及历史对当下的启示意义。适合有一定历史阅读基础的书友参加。",
      city: "北京",
      district: "朝阳区",
      locationName: "朝阳区漫咖啡",
      locationAddress: "北京市朝阳区三里屯路19号",
      latitude: 39.934,
      longitude: 116.454,
      startAt: futureISO(72),
      endAt: futureISO(75),
      maxParticipants: 6,
      readingLevel: "intermediate",
      bookMode: "bring_own",
      format: "offline",
      discussionTopic: "黄仁宇的'大历史观'对我们理解当今社会变革有哪些启发？万历年间的制度困境在现代社会是否以不同形式存在？",
      creatorTrustScore: 78,
      approvalMode: "manual",
      auditStatus: "auto_passed",
      aiModeration: { verdict: "auto_passed", reasons: [] },
      aiScore: 92,
      status: "open",
      acceptedCount: 3,
      waitlistCount: 1,
      confirmedCount: 2,
      createdAt: pastISO(168),
      updatedAt: pastISO(48)
    },
    {
      id: generateId(),
      creatorOpenid: "demo_user_04",
      title: "《三体》科幻共读夜",
      genre: "scifi",
      description: "刘慈欣的《三体》是中国科幻文学的里程碑之作。本次线上共读活动将在晚间进行，一起探索宇宙文明的可能性、黑暗森林法则的深意，以及人类面对未知时的选择。欢迎所有科幻爱好者加入！",
      city: "上海",
      district: "徐汇区",
      locationName: "线上活动",
      locationAddress: "",
      latitude: 0,
      longitude: 0,
      startAt: futureISO(96),
      endAt: futureISO(99),
      maxParticipants: 12,
      readingLevel: "all",
      bookMode: "bring_own",
      format: "online",
      discussionTopic: "黑暗森林法则在现实的国际关系或商业竞争中是否存在映射？你如何看待人类文明的'面壁计划'？",
      creatorTrustScore: 65,
      approvalMode: "auto",
      auditStatus: "auto_passed",
      aiModeration: { verdict: "auto_passed", reasons: [] },
      aiScore: 80,
      status: "open",
      acceptedCount: 5,
      waitlistCount: 0,
      confirmedCount: 3,
      createdAt: pastISO(96),
      updatedAt: pastISO(12)
    },
    {
      id: generateId(),
      creatorOpenid: "demo_user_current",
      title: "《被讨厌的勇气》周末读书会",
      genre: "psychology",
      description: "阿德勒心理学告诉我们——一切烦恼都来源于人际关系，而幸福的钥匙就在自己手中。本次读书会围绕《被讨厌的勇气》展开，通过对话式的讨论，一起探索课题分离、目的论等核心概念的实际应用。",
      city: "北京",
      district: "朝阳区",
      locationName: "朝阳区咖啡馆",
      locationAddress: "北京市朝阳区望京SOHO T3",
      latitude: 39.997,
      longitude: 116.475,
      startAt: futureISO(36),
      endAt: futureISO(39),
      maxParticipants: 6,
      readingLevel: "all",
      bookMode: "shared",
      format: "offline",
      discussionTopic: "课题分离在日常人际关系中如何实践？你是否认同'一切烦恼都来源于人际关系'这一观点？",
      creatorTrustScore: 75,
      approvalMode: "manual",
      auditStatus: "auto_passed",
      aiModeration: { verdict: "auto_passed", reasons: [] },
      aiScore: 85,
      status: "open",
      acceptedCount: 2,
      waitlistCount: 0,
      confirmedCount: 1,
      createdAt: pastISO(48),
      updatedAt: pastISO(6)
    }
  ];

  for (var a = 0; a < demoActivities.length; a++) {
    db.activities.push(demoActivities[a]);
  }

  // --- 生成 Demo 申请 ---
  var demoApplications = [
    // demo_user_current 申请了《从零到一》活动
    {
      id: generateId(),
      activityId: demoActivities[0].id,
      applicantOpenid: "demo_user_current",
      applicantNickname: "小书虫",
      applicantCity: "北京",
      applicantReadingLevel: "intermediate",
      message: "对商业创新很感兴趣，期待和大家交流！",
      status: "accepted",
      attendanceStatus: "confirmed",
      confirmedAt: pastISO(96),
      reviewedAt: pastISO(100),
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(110),
      updatedAt: pastISO(96)
    },
    // demo_user_05 申请了《从零到一》活动
    {
      id: generateId(),
      activityId: demoActivities[0].id,
      applicantOpenid: "demo_user_05",
      applicantNickname: "成长型选手",
      applicantCity: "北京",
      applicantReadingLevel: "beginner",
      message: "刚开始接触商业书籍，希望能向大家学习。",
      status: "accepted",
      attendanceStatus: null,
      confirmedAt: pastISO(80),
      reviewedAt: pastISO(85),
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(90),
      updatedAt: pastISO(80)
    },
    // demo_user_current 申请了《万历十五年》活动
    {
      id: generateId(),
      activityId: demoActivities[1].id,
      applicantOpenid: "demo_user_current",
      applicantNickname: "小书虫",
      applicantCity: "北京",
      applicantReadingLevel: "intermediate",
      message: "最近在读历史类书籍，黄仁宇的大历史观很有启发性。",
      status: "accepted",
      attendanceStatus: "confirmed",
      confirmedAt: pastISO(130),
      reviewedAt: pastISO(140),
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(150),
      updatedAt: pastISO(130)
    },
    // demo_user_05 申请了《万历十五年》活动
    {
      id: generateId(),
      activityId: demoActivities[1].id,
      applicantOpenid: "demo_user_05",
      applicantNickname: "成长型选手",
      applicantCity: "北京",
      applicantReadingLevel: "beginner",
      message: "虽然是入门读者，但对历史很感兴趣，想拓宽视野。",
      status: "accepted",
      attendanceStatus: null,
      confirmedAt: pastISO(120),
      reviewedAt: pastISO(125),
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(130),
      updatedAt: pastISO(120)
    },
    // demo_user_02 申请了《万历十五年》活动
    {
      id: generateId(),
      activityId: demoActivities[1].id,
      applicantOpenid: "demo_user_02",
      applicantNickname: "商业观察家",
      applicantCity: "北京",
      applicantReadingLevel: "advanced",
      message: "想从历史的角度理解制度设计与社会发展的关系。",
      status: "accepted",
      attendanceStatus: "confirmed",
      confirmedAt: pastISO(110),
      reviewedAt: pastISO(115),
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(120),
      updatedAt: pastISO(110)
    },
    // demo_user_04 申请了《万历十五年》——候补
    {
      id: generateId(),
      activityId: demoActivities[1].id,
      applicantOpenid: "demo_user_04",
      applicantNickname: "科幻旅者",
      applicantCity: "上海",
      applicantReadingLevel: "beginner",
      message: "虽然是上海的，但如果有线上参与的可能也很想加入。",
      status: "waitlisted",
      attendanceStatus: null,
      confirmedAt: null,
      reviewedAt: null,
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(100),
      updatedAt: pastISO(100)
    },
    // demo_user_03 申请了《被讨厌的勇气》活动
    {
      id: generateId(),
      activityId: demoActivities[3].id,
      applicantOpenid: "demo_user_03",
      applicantNickname: "历史控",
      applicantCity: "北京",
      applicantReadingLevel: "intermediate",
      message: "阿德勒心理学和历史研究有很多相通之处，期待交流。",
      status: "accepted",
      attendanceStatus: "confirmed",
      confirmedAt: pastISO(36),
      reviewedAt: pastISO(40),
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(44),
      updatedAt: pastISO(36)
    },
    // demo_user_05 申请了《被讨厌的勇气》活动
    {
      id: generateId(),
      activityId: demoActivities[3].id,
      applicantOpenid: "demo_user_05",
      applicantNickname: "成长型选手",
      applicantCity: "北京",
      applicantReadingLevel: "beginner",
      message: "这本书改变了我对人际关系的看法，很想和大家讨论。",
      status: "accepted",
      attendanceStatus: null,
      confirmedAt: pastISO(30),
      reviewedAt: pastISO(32),
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(35),
      updatedAt: pastISO(30)
    },
    // demo_user_02 申请了《三体》活动
    {
      id: generateId(),
      activityId: demoActivities[2].id,
      applicantOpenid: "demo_user_02",
      applicantNickname: "商业观察家",
      applicantCity: "北京",
      applicantReadingLevel: "advanced",
      message: "黑暗森林法则在商业竞争中也有很多映射，想一起探讨。",
      status: "accepted",
      attendanceStatus: "confirmed",
      confirmedAt: pastISO(80),
      reviewedAt: null,
      cancelledAt: null,
      cancelReason: "",
      createdAt: pastISO(85),
      updatedAt: pastISO(80)
    }
  ];

  for (var ap = 0; ap < demoApplications.length; ap++) {
    db.applications.push(demoApplications[ap]);
  }

  // --- 生成 Demo 评价 ---
  var demoReviews = [
    {
      id: generateId(),
      activityId: demoActivities[0].id,
      reviewerOpenid: "demo_user_current",
      targetOpenid: "demo_user_02",
      punctuality: 5,
      focus: 4,
      discussion: 5,
      preparation: 5,
      relativeScore: 5,
      comment: "组织者非常用心，讨论话题设计得很好，收获满满！",
      createdAt: pastISO(48)
    },
    {
      id: generateId(),
      activityId: demoActivities[0].id,
      reviewerOpenid: "demo_user_05",
      targetOpenid: "demo_user_02",
      punctuality: 5,
      focus: 4,
      discussion: 4,
      preparation: 4,
      relativeScore: 4,
      comment: "活动氛围很好，作为入门读者也感到很受欢迎。",
      createdAt: pastISO(46)
    },
    {
      id: generateId(),
      activityId: demoActivities[1].id,
      reviewerOpenid: "demo_user_current",
      targetOpenid: "demo_user_03",
      punctuality: 5,
      focus: 5,
      discussion: 5,
      preparation: 4,
      relativeScore: 5,
      comment: "历史控的解读非常有深度，让我对万历十五年有了全新理解。",
      createdAt: pastISO(60)
    },
    {
      id: generateId(),
      activityId: demoActivities[1].id,
      reviewerOpenid: "demo_user_02",
      targetOpenid: "demo_user_03",
      punctuality: 4,
      focus: 5,
      discussion: 4,
      preparation: 5,
      relativeScore: 4,
      comment: "从商业角度参与历史讨论，碰撞出了很有意思的观点。",
      createdAt: pastISO(58)
    }
  ];

  for (var rv = 0; rv < demoReviews.length; rv++) {
    db.matchReviews.push(demoReviews[rv]);
  }

  // --- 生成 Demo 意向 ---
  var demoIntents = [
    {
      id: generateId(),
      openid: "demo_user_02",
      genre: "business",
      city: "北京",
      district: "海淀区",
      timeSlot: "weekend_afternoon",
      createdAt: pastISO(12),
      expiresAt: futureISO(60)
    },
    {
      id: generateId(),
      openid: "demo_user_05",
      genre: "self_help",
      city: "北京",
      district: "朝阳区",
      timeSlot: "weekend_morning",
      createdAt: pastISO(8),
      expiresAt: futureISO(64)
    },
    {
      id: generateId(),
      openid: "demo_user_03",
      genre: "history",
      city: "北京",
      district: "东城区",
      timeSlot: "weekend_afternoon",
      createdAt: pastISO(6),
      expiresAt: futureISO(66)
    },
    {
      id: generateId(),
      openid: "demo_user_04",
      genre: "scifi",
      city: "上海",
      district: "徐汇区",
      timeSlot: "weekend_evening",
      createdAt: pastISO(4),
      expiresAt: futureISO(68)
    }
  ];

  for (var mi = 0; mi < demoIntents.length; mi++) {
    db.matchIntents.push(demoIntents[mi]);
  }

  // --- 生成 Demo 分享记录 ---
  db.activityShares.push(
    { id: generateId(), activityId: demoActivities[0].id, openid: "demo_user_02", channel: "wechat", createdAt: pastISO(110) },
    { id: generateId(), activityId: demoActivities[1].id, openid: "demo_user_03", channel: "wechat", createdAt: pastISO(155) },
    { id: generateId(), activityId: demoActivities[2].id, openid: "demo_user_04", channel: "wechat_moments", createdAt: pastISO(90) }
  );

  save();

  return ok({
    seeded: true,
    summary: {
      users: db.users.length,
      activities: db.activities.length,
      applications: db.applications.length,
      reviews: db.matchReviews.length,
      intents: db.matchIntents.length,
      shares: db.activityShares.length
    },
    currentUserOpenid: "demo_user_current"
  });
}

// ============================================================
//  种子数据 (首次初始化)
// ============================================================

function buildSeedData() {
  // 当前用户
  db.users.push({
    openid: "mock_current_user",
    nickname: "",
    avatarUrl: "",
    city: "",
    district: "",
    readingLevel: "",
    preferredGenres: [],
    availableSlots: [],
    bio: "",
    identityStatus: "new",
    profileCompletion: 0,
    createdAt: now(),
    updatedAt: now()
  });

  // 另一个用户
  db.users.push({
    openid: "mock_other_user",
    nickname: "爱读书的小王",
    avatarUrl: "",
    city: "北京",
    district: "朝阳区",
    readingLevel: "intermediate",
    preferredGenres: ["literature", "psychology"],
    availableSlots: ["weekend_afternoon", "weekday_evening"],
    bio: "周末喜欢在咖啡馆看书，偏好文学和心理学方向。",
    identityStatus: "active",
    profileCompletion: 100,
    createdAt: pastISO(240),
    updatedAt: pastISO(48)
  });

  // 活动 1: 文学小说 朝阳区咖啡馆
  var act1Id = generateId();
  db.activities.push({
    id: act1Id,
    creatorOpenid: "mock_other_user",
    title: "《人间失格》周末共读会",
    genre: "literature",
    description: "太宰治的代表作，探讨人性的脆弱与自我认同。本次共读活动将在朝阳区一家安静的咖啡馆进行，大家先自由阅读一小时，然后围坐讨论。无论你是第一次读还是重温经典，都欢迎加入。",
    city: "北京",
    district: "朝阳区",
    locationName: "朝阳区字里行间书店",
    locationAddress: "北京市朝阳区三里屯路太古里北区B1层",
    latitude: 39.934,
    longitude: 116.454,
    startAt: futureISO(48),
    endAt: futureISO(51),
    maxParticipants: 6,
    readingLevel: "all",
    bookMode: "bring_own",
    format: "offline",
    discussionTopic: "太宰治笔下叶藏的'讨好型人格'在当代社会是否更加普遍？我们如何面对内心的脆弱？",
    creatorTrustScore: 72,
    approvalMode: "manual",
    auditStatus: "auto_passed",
    aiModeration: { verdict: "auto_passed", reasons: [] },
    aiScore: 85,
    status: "open",
    acceptedCount: 1,
    waitlistCount: 0,
    confirmedCount: 0,
    createdAt: pastISO(72),
    updatedAt: pastISO(24)
  });

  // 活动 2: 商业管理 海淀区图书馆
  var act2Id = generateId();
  db.activities.push({
    id: act2Id,
    creatorOpenid: "mock_other_user",
    title: "《思考，快与慢》读书沙龙",
    genre: "business",
    description: "丹尼尔·卡尼曼的诺奖之作，揭示了人类思维的两个系统。本次沙龙将聚焦书中关于认知偏误和决策陷阱的核心章节，结合实际案例讨论如何做出更好的决策。活动面向所有对行为经济学和决策科学感兴趣的朋友。",
    city: "北京",
    district: "海淀区",
    locationName: "海淀区图书馆",
    locationAddress: "北京市海淀区中关村大街27号",
    latitude: 39.983,
    longitude: 116.316,
    startAt: futureISO(72),
    endAt: futureISO(75),
    maxParticipants: 8,
    readingLevel: "intermediate",
    bookMode: "bring_own",
    format: "offline",
    discussionTopic: "系统1和系统2在日常决策中如何博弈？你有没有因为认知偏误做出过后悔的决定？",
    creatorTrustScore: 72,
    approvalMode: "auto",
    auditStatus: "auto_passed",
    aiModeration: { verdict: "auto_passed", reasons: [] },
    aiScore: 90,
    status: "open",
    acceptedCount: 0,
    waitlistCount: 0,
    confirmedCount: 0,
    createdAt: pastISO(48),
    updatedAt: pastISO(12)
  });

  // 活动1有一条申请
  db.applications.push({
    id: generateId(),
    activityId: act1Id,
    applicantOpenid: "mock_current_user",
    applicantNickname: "",
    applicantCity: "",
    applicantReadingLevel: "",
    message: "很喜欢太宰治的作品，期待和大家交流！",
    status: "accepted",
    attendanceStatus: null,
    confirmedAt: pastISO(48),
    reviewedAt: pastISO(50),
    cancelledAt: null,
    cancelReason: "",
    createdAt: pastISO(60),
    updatedAt: pastISO(48)
  });

  // 更新活动1的 acceptedCount
  db.activities[0].acceptedCount = 1;
}

// ============================================================
//  路由总入口
// ============================================================

function handle(action, data) {
  data = data || {};
  load(); // 确保 DB 已加载

  switch (action) {
    // ---- 用户 ----
    case "login":
      return handleLogin(data);
    case "me":
      return handleMe(data);
    case "getDashboard":
      return handleGetDashboard(data);
    case "updateProfile":
      return handleUpdateProfile(data);

    // ---- 活动 ----
    case "createActivity":
      return handleCreateActivity(data);
    case "cancelActivity":
      return handleCancelActivity(data);
    case "applyActivity":
      return handleApplyActivity(data);
    case "withdrawApplication":
      return handleWithdrawApplication(data);
    case "confirmAttendance":
      return handleConfirmAttendance(data);
    case "recommendations":
      return handleRecommendations(data);
    case "getActivityDetail":
      return handleGetActivityDetail(data);
    case "reviewApplication":
      return handleReviewApplication(data);

    // ---- 反馈与屏蔽 ----
    case "recordRecommendationFeedback":
      return handleRecordRecommendationFeedback(data);
    case "recordActivityShare":
      return handleRecordActivityShare(data);
    case "blockActivityCreator":
      return handleBlockActivityCreator(data);

    // ---- 评价 ----
    case "submitMatchReview":
      return handleSubmitMatchReview(data);
    case "getMatchRatingProfile":
      return handleGetMatchRatingProfile(data);
    case "getReliabilityProfile":
      return handleGetReliabilityProfile(data);

    // ---- AI ----
    case "getAiProfile":
      return handleGetAiProfile(data);
    case "aiAssist":
      return handleAiAssist(data);

    // ---- 意向池 ----
    case "createMatchIntent":
      return handleCreateMatchIntent(data);
    case "listIntentPools":
      return handleListIntentPools(data);

    // ---- 运营 ----
    case "getOpsQueue":
      return handleGetOpsQueue(data);
    case "getOpsFunnel":
      return handleGetOpsFunnel(data);
    case "getCityOpsSummary":
      return handleGetCityOpsSummary(data);

    // ---- 我的列表 ----
    case "getMyApplications":
      return handleGetMyApplications(data);
    case "getMyCreated":
      return handleGetMyCreated(data);

    // ---- 举报 ----
    case "createReport":
      return handleCreateReport(data);
    case "resolveReport":
      return handleResolveReport(data);
    case "resolveActivityReview":
      return handleResolveActivityReview(data);

    // ---- 地点搜索 ----
    case "searchPlaces":
      return handleSearchPlaces(data);

    // ---- 种子数据 ----
    case "seedDemoScenario":
      return handleSeedDemoScenario(data);

    default:
      return fail("未知操作: " + action);
  }
}

// ============================================================
//  导出
// ============================================================

module.exports = {
  handle: handle
};
