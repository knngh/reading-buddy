/**
 * 读书搭子小程序 - 本地 AI 评分引擎
 *
 * 提供基于规则的智能分析能力，无需外部 API 调用即可运行。
 * 涵盖用户画像分析、活动内容生成、内容审核、匹配评分、举报分类等功能。
 *
 * 在云函数侧可通过 HTTP 请求扩展外部 AI（如 GPT）作为增强层，
 * 本地逻辑始终作为兜底策略。
 */

"use strict";

// ─────────────────────────────────────────────────────────
// 常量定义
// ─────────────────────────────────────────────────────────

var GENRE_LABELS = {
  literature: "文学小说",
  philosophy: "哲学思想",
  history: "历史传记",
  science: "科学技术",
  business: "商业经管",
  psychology: "心理成长",
  art: "艺术设计",
  social: "社会科学",
  self_help: "自我提升",
  lifestyle: "生活美学",
  tech: "编程技术",
  education: "教育学习",
};

var LEVEL_LABELS = {
  beginner: "入门读者",
  casual: "休闲读者",
  regular: "稳定读者",
  avid: "深度读者",
  expert: "专业研究者",
};

var FORMAT_LABELS = {
  offline: "线下见面",
  online_video: "线上视频",
  online_voice: "线上语音",
  chat: "文字讨论",
  hybrid: "线上线下结合",
};

var BOOK_MODE_LABELS = {
  together: "共读同一本",
  theme: "主题选书",
  free: "自由选书",
  leader_pick: "发起人指定",
};

// 人格标签映射表
var PERSONA_MAP = {
  literature: ["文艺青年", "浪漫主义者"],
  philosophy: ["深度思考者", "理性主义者"],
  history: ["历史爱好者", "考据控"],
  science: ["好奇宝宝", "科学迷"],
  business: ["职场精英", "创业思维"],
  psychology: ["内心探索者", "共情达人"],
  art: ["审美先锋", "创意灵感"],
  social: ["社会观察者", "公共议题关注者"],
  self_help: ["成长型思维", "行动派"],
  lifestyle: ["生活美学家", "慢生活倡导者"],
  tech: ["技术极客", "代码诗人"],
  education: ["终身学习者", "知识分享者"],
};

// 组合人格标签
var PERSONA_COMBOS = {
  "literature+philosophy": "知识分子型读者",
  "literature+art": "文艺创作者",
  "philosophy+psychology": "心灵哲学家",
  "business+self_help": "效率达人",
  "science+tech": "硬核技术派",
  "history+social": "人文社科研究者",
  "psychology+self_help": "成长教练型",
  "art+lifestyle": "美学实践者",
  "literature+lifestyle": "诗意生活家",
  "business+tech": "科技创业者",
};

// _blocked 关键词列表
var BLOCKED_TERMS = [
  "代写", "加微信", "加QQ", "转账", "红包",
  "付费", "兼职", "刷单", "贷款", "网贷",
  "套现", "赌博", "博彩", "色情", "约炮",
];

// 举报类别映射
var REPORT_CATEGORIES = {
  spam: { label: "垃圾广告", baseSeverity: "medium" },
  harassment: { label: "骚扰辱骂", baseSeverity: "high" },
  fraud: { label: "欺诈行为", baseSeverity: "high" },
  inappropriate: { label: "不当内容", baseSeverity: "medium" },
  copyright: { label: "侵权问题", baseSeverity: "medium" },
  safety: { label: "人身安全", baseSeverity: "high" },
  other: { label: "其他问题", baseSeverity: "low" },
};

// ─────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────

/**
 * 安全地从对象中取值，支持嵌套路径
 */
function safeGet(obj, path, defaultVal) {
  if (!obj || !path) return defaultVal !== undefined ? defaultVal : null;
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return defaultVal !== undefined ? defaultVal : null;
    cur = cur[parts[i]];
  }
  return cur !== undefined ? cur : (defaultVal !== undefined ? defaultVal : null);
}

/**
 * 将数组安全转换为字符串列表
 */
function ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

/**
 * 计算两个数组的交集
 */
function intersect(a, b) {
  if (!a || !b) return [];
  var setB = {};
  b.forEach(function (v) { setB[v] = true; });
  return a.filter(function (v) { return setB[v]; });
}

/**
 * 将分数限制在 [0, 100] 范围内
 */
function clamp(val, min, max) {
  if (min === undefined) min = 0;
  if (max === undefined) max = 100;
  return Math.max(min, Math.min(max, val));
}

/**
 * 根据分数返回等级
 */
function scoreToGrade(score) {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

/**
 * 获取当前时间戳（毫秒）
 */
function nowMs() {
  return Date.now();
}

/**
 * 生成简短随机 ID（用于内部标记）
 */
function shortId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─────────────────────────────────────────────────────────
// 1. analyzeProfile - 用户画像分析
// ─────────────────────────────────────────────────────────

/**
 * 分析用户画像，返回结构化洞察。
 *
 * @param {Object} user - 用户对象
 * @returns {Object} 画像分析结果
 */
function analyzeProfile(user) {
  if (!user) {
    return _emptyProfileResult();
  }

  var genres = ensureArray(user.genres);
  var level = user.readingLevel || "";
  var city = user.city || "";
  var slots = ensureArray(user.availableSlots);
  var formats = ensureArray(user.preferredFormats);
  var bookCount = user.monthlyBookCount || 0;
  var bio = user.bio || "";
  var favBooks = ensureArray(user.favoriteBooks);
  var favAuthors = ensureArray(user.favoriteAuthors);

  // ── 构建摘要 ──
  var summary = _buildProfileSummary(genres, level, city, bookCount);

  // ── 人格标签 ──
  var personaTags = _computePersonaTags(genres);

  // ── 优势字段 ──
  var strengths = [];
  if (genres.length > 0) strengths.push("已选择阅读类型（" + genres.length + "个）");
  if (level) strengths.push("已设置阅读等级");
  if (city) strengths.push("已填写所在城市");
  if (slots.length > 0) strengths.push("已设置可用时间");
  if (formats.length > 0) strengths.push("已选择活动形式偏好");
  if (bio.length >= 20) strengths.push("个人简介内容丰富");
  if (favBooks.length > 0) strengths.push("已添加喜欢的书籍");
  if (favAuthors.length > 0) strengths.push("已添加喜欢的作者");

  // ── 缺失字段 ──
  var gaps = [];
  if (genres.length === 0) gaps.push({ field: "genres", label: "阅读类型", importance: "high" });
  if (!level) gaps.push({ field: "readingLevel", label: "阅读等级", importance: "high" });
  if (!city) gaps.push({ field: "city", label: "所在城市", importance: "medium" });
  if (slots.length === 0) gaps.push({ field: "availableSlots", label: "可用时间", importance: "medium" });
  if (formats.length === 0) gaps.push({ field: "preferredFormats", label: "活动形式", importance: "medium" });
  if (bio.length < 10) gaps.push({ field: "bio", label: "个人简介", importance: "low" });
  if (favBooks.length === 0) gaps.push({ field: "favoriteBooks", label: "喜欢的书籍", importance: "low" });
  if (favAuthors.length === 0) gaps.push({ field: "favoriteAuthors", label: "喜欢的作者", importance: "low" });

  // ── 下一步行动建议 ──
  var nextActions = _buildNextActions(gaps, strengths);

  // ── 类型亲和度 ──
  var genreAffinity = _computeGenreAffinity(genres, favBooks, favAuthors, level);

  // ── 推荐策略 ──
  var recommendationStrategy = _buildRecommendationStrategy(genres, level, city, formats, slots);

  // ── 完整度评分 ──
  var completenessScore = _calcCompleteness(user);

  return {
    summary: summary,
    personaTags: personaTags,
    strengths: strengths,
    gaps: gaps,
    nextActions: nextActions,
    genreAffinity: genreAffinity,
    recommendationStrategy: recommendationStrategy,
    completenessScore: completenessScore,
    profileGrade: scoreToGrade(completenessScore),
  };
}

/**
 * 构建画像摘要文本
 */
function _buildProfileSummary(genres, level, city, bookCount) {
  var genrePart = "";
  if (genres.length > 0) {
    var genreNames = genres.map(function (g) { return GENRE_LABELS[g] || g; });
    genrePart = "偏好" + genreNames.join("、") + "的";
  }

  var levelPart = "";
  if (level && LEVEL_LABELS[level]) {
    levelPart = LEVEL_LABELS[level];
  } else {
    levelPart = "读者";
  }

  var summary = "你是一位" + genrePart + levelPart;

  if (bookCount > 0) {
    summary += "，每月阅读约" + bookCount + "本书";
  }

  if (city) {
    summary += "，目前在" + city;
  }

  if (genres.length === 0) {
    summary = "你的资料还是空白的，完善阅读偏好可以获得更精准的推荐";
    if (city) summary += "。目前在" + city;
  }

  summary += "。";
  return summary;
}

/**
 * 计算人格标签
 */
function _computePersonaTags(genres) {
  var tags = [];
  var seen = {};

  // 单类型标签
  genres.forEach(function (g) {
    var personas = PERSONA_MAP[g] || [];
    personas.forEach(function (p) {
      if (!seen[p]) {
        tags.push(p);
        seen[p] = true;
      }
    });
  });

  // 组合标签
  var sortedGenres = genres.slice().sort();
  for (var i = 0; i < sortedGenres.length; i++) {
    for (var j = i + 1; j < sortedGenres.length; j++) {
      var key = sortedGenres[i] + "+" + sortedGenres[j];
      if (PERSONA_COMBOS[key] && !seen[PERSONA_COMBOS[key]]) {
        tags.push(PERSONA_COMBOS[key]);
        seen[PERSONA_COMBOS[key]] = true;
      }
    }
  }

  // 根据类型数量添加额外标签
  if (genres.length >= 4) {
    tags.push("跨界阅读者");
  }
  if (genres.length >= 6) {
    tags.push("博览群书型");
  }

  return tags.slice(0, 6); // 最多返回 6 个标签
}

/**
 * 构建下一步行动建议
 */
function _buildNextActions(gaps, strengths) {
  var actions = [];

  // 按重要性排序
  var highGaps = gaps.filter(function (g) { return g.importance === "high"; });
  var medGaps = gaps.filter(function (g) { return g.importance === "medium"; });
  var lowGaps = gaps.filter(function (g) { return g.importance === "low"; });

  highGaps.forEach(function (g) {
    actions.push({
      field: g.field,
      label: g.label,
      priority: "high",
      hint: "完善「" + g.label + "」可以显著提升匹配精度",
    });
  });

  medGaps.forEach(function (g) {
    actions.push({
      field: g.field,
      label: g.label,
      priority: "medium",
      hint: "补充「" + g.label + "」让推荐更贴合你的节奏",
    });
  });

  if (lowGaps.length > 0 && actions.length < 4) {
    actions.push({
      field: lowGaps[0].field,
      label: lowGaps[0].label,
      priority: "low",
      hint: "丰富「" + lowGaps[0].label + "」让别人更了解你",
    });
  }

  // 如果已经很完整，鼓励参与活动
  if (actions.length === 0) {
    actions.push({
      field: null,
      label: "开始参与活动",
      priority: "info",
      hint: "你的资料已相当完善，去看看推荐的活动吧！",
    });
  }

  return actions.slice(0, 5);
}

/**
 * 计算各类型亲和度评分
 */
function _computeGenreAffinity(genres, favBooks, favAuthors, level) {
  var affinity = {};
  var allGenres = Object.keys(GENRE_LABELS);

  allGenres.forEach(function (g) {
    var score = 0;

    // 用户选择的类型加分
    if (genres.indexOf(g) >= 0) {
      score += 60;
      // 排在第一位的类型额外加分
      if (genres[0] === g) score += 15;
      if (genres[1] === g) score += 8;
    }

    // 阅读等级影响
    if (level === "avid" || level === "expert") score += 10;
    else if (level === "regular") score += 5;

    // 有喜欢的书籍/作者加分
    if (favBooks.length > 0) score += 5;
    if (favAuthors.length > 0) score += 5;

    // 未被选择的类型给一个基础分（用于冷启动探索）
    if (genres.indexOf(g) < 0) {
      score = Math.max(5, Math.round(score * 0.2));
    }

    affinity[g] = clamp(score);
  });

  return affinity;
}

/**
 * 构建推荐策略
 */
function _buildRecommendationStrategy(genres, level, city, formats, slots) {
  var strategy = {
    primaryGenres: genres.slice(0, 3),
    levelRange: _levelRange(level),
    preferOnline: false,
    preferOffline: false,
    timeFlexibility: "unknown",
    matchingWeights: {
      genre: 0.36,
      level: 0.14,
      time: 0.10,
      format: 0.10,
      city: 0.10,
      trust: 0.10,
      quality: 0.10,
    },
  };

  // 形式偏好
  if (formats.indexOf("offline") >= 0) strategy.preferOffline = true;
  if (formats.indexOf("online_video") >= 0 || formats.indexOf("online_voice") >= 0 || formats.indexOf("chat") >= 0) {
    strategy.preferOnline = true;
  }

  // 时间灵活度
  if (slots.indexOf("flexible") >= 0) {
    strategy.timeFlexibility = "high";
  } else if (slots.length >= 3) {
    strategy.timeFlexibility = "medium";
  } else if (slots.length > 0) {
    strategy.timeFlexibility = "low";
  }

  return strategy;
}

/**
 * 根据用户等级确定匹配的等级范围
 */
function _levelRange(level) {
  var ranges = {
    beginner: ["beginner", "casual"],
    casual: ["beginner", "casual", "regular"],
    regular: ["casual", "regular", "avid"],
    avid: ["regular", "avid", "expert"],
    expert: ["avid", "expert"],
  };
  return ranges[level] || ["beginner", "casual", "regular", "avid", "expert"];
}

/**
 * 计算资料完整度评分
 */
function _calcCompleteness(user) {
  var score = 0;
  var weights = {
    genres: 15,
    readingLevel: 12,
    city: 8,
    availableSlots: 10,
    preferredFormats: 8,
    bio: 12,
    favoriteBooks: 10,
    favoriteAuthors: 5,
    bookMode: 5,
    monthlyBookCount: 5,
    avatarUrl: 5,
    nickname: 5,
  };

  if (ensureArray(user.genres).length > 0) score += weights.genres;
  if (user.readingLevel) score += weights.readingLevel;
  if (user.city) score += weights.city;
  if (ensureArray(user.availableSlots).length > 0) score += weights.availableSlots;
  if (ensureArray(user.preferredFormats).length > 0) score += weights.preferredFormats;
  if ((user.bio || "").length >= 10) score += weights.bio * 0.5;
  if ((user.bio || "").length >= 30) score += weights.bio * 0.5;
  if (ensureArray(user.favoriteBooks).length > 0) score += weights.favoriteBooks;
  if (ensureArray(user.favoriteAuthors).length > 0) score += weights.favoriteAuthors;
  if (user.bookMode) score += weights.bookMode;
  if (user.monthlyBookCount > 0) score += weights.monthlyBookCount;
  if (user.avatarUrl) score += weights.avatarUrl;
  if (user.nickname) score += weights.nickname;

  return clamp(score);
}

/**
 * 空结果
 */
function _emptyProfileResult() {
  return {
    summary: "你的资料还是空白的，完善资料可以获得更精准的推荐哦！",
    personaTags: [],
    strengths: [],
    gaps: [
      { field: "genres", label: "阅读类型", importance: "high" },
      { field: "readingLevel", label: "阅读等级", importance: "high" },
    ],
    nextActions: [
      { field: "genres", label: "选择阅读类型", priority: "high", hint: "告诉我们你喜欢读什么类型的书" },
      { field: "readingLevel", label: "设置阅读等级", priority: "high", hint: "帮助我们匹配同等水平的读友" },
    ],
    genreAffinity: {},
    recommendationStrategy: {},
    completenessScore: 0,
    profileGrade: "D",
  };
}

// ─────────────────────────────────────────────────────────
// 2. draftActivity - 活动内容生成
// ─────────────────────────────────────────────────────────

/**
 * 根据表单信息生成活动内容草稿。
 *
 * @param {Object} form - 活动表单数据
 * @returns {Object} 生成的活动内容
 */
function draftActivity(form) {
  if (!form) form = {};

  var bookName = form.bookName || "";
  var genre = form.genre || (form.genres && form.genres[0]) || "literature";
  var format = form.format || "offline";
  var bookMode = form.bookMode || "together";
  var level = form.readingLevel || "casual";
  var city = form.city || "";
  var maxMembers = form.maxMembers || 6;
  var customNote = form.customNote || "";

  // ── 生成标题 ──
  var title = _generateActivityTitle(bookName, genre, format, bookMode);

  // ── 生成描述 ──
  var description = _generateActivityDescription(
    bookName, genre, format, bookMode, level, city, maxMembers, customNote
  );

  // ── 生成讨论话题 ──
  var discussionTopics = _generateDiscussionTopics(bookName, genre, bookMode);

  // ── 生成标签 ──
  var tags = _generateActivityTags(genre, format, bookMode, level, city);

  // ── 阅读准备建议 ──
  var prepTips = _generatePrepTips(bookName, genre, format);

  return {
    title: title,
    description: description,
    discussionTopics: discussionTopics,
    tags: tags,
    prepTips: prepTips,
    suggestedMaxMembers: maxMembers,
    suggestedDuration: _suggestDuration(format),
  };
}

/**
 * 生成活动标题
 */
function _generateActivityTitle(bookName, genre, format, bookMode) {
  var genreLabel = GENRE_LABELS[genre] || "阅读";
  var formatLabel = FORMAT_LABELS[format] || "线上";

  if (bookName) {
    var templates = [
      "《" + bookName + "》周末共读会 | 一起探讨" + genreLabel + "之美",
      "《" + bookName + "》读书会 · " + formatLabel + "交流",
      "一起读《" + bookName + "》| " + genreLabel + "爱好者集结",
      "《" + bookName + "》精读分享 · 与志同道合的人对话",
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // 没有书名时按类型生成
  var genericTemplates = [
    genreLabel + "主题读书会 | " + formatLabel + "共读",
    genreLabel + "爱好者线上沙龙 · 分享与碰撞",
    "一起探索" + genreLabel + "的世界 | 周末读书约",
    genreLabel + "共读计划 · 寻找同频的你",
    "本周" + genreLabel + "读书圈 · 新朋旧友一起聊",
  ];
  return genericTemplates[Math.floor(Math.random() * genericTemplates.length)];
}

/**
 * 生成活动描述
 */
function _generateActivityDescription(bookName, genre, format, bookMode, level, city, maxMembers, customNote) {
  var genreLabel = GENRE_LABELS[genre] || "阅读";
  var formatLabel = FORMAT_LABELS[format] || "线上";
  var levelLabel = LEVEL_LABELS[level] || "";
  var bookModeLabel = BOOK_MODE_LABELS[bookMode] || "共读";

  var paragraphs = [];

  // 第一段：活动简介
  var intro = "";
  if (bookName) {
    intro = "本期读书活动围绕《" + bookName + "》展开，";
  } else {
    intro = "本期读书活动以" + genreLabel + "为主题，";
  }
  intro += "采用" + bookModeLabel + "的方式，";
  intro += "通过" + formatLabel + "的形式进行交流。";
  if (maxMembers > 0) {
    intro += "本次活动限" + maxMembers + "人参与，";
  }
  if (levelLabel) {
    intro += "适合" + levelLabel + "及以上水平的读者。";
  } else {
    intro += "欢迎所有阅读爱好者参加。";
  }
  paragraphs.push(intro);

  // 第二段：活动安排
  var arrangement = "【活动安排】\n";
  arrangement += "1. 开场破冰（5-10 分钟）：简单自我介绍和阅读近况分享\n";
  if (bookName) {
    arrangement += "2. 主题讨论（30-40 分钟）：围绕《" + bookName + "》的核心话题展开讨论\n";
    arrangement += "3. 自由交流（15-20 分钟）：延伸话题、推荐相关书籍\n";
  } else {
    arrangement += "2. 主题分享（30-40 分钟）：每人分享近期阅读心得或推荐一本好书\n";
    arrangement += "3. 自由交流（15-20 分钟）：互相推荐、答疑解惑\n";
  }
  arrangement += "4. 总结收尾（5 分钟）：回顾要点、约定下次活动";
  paragraphs.push(arrangement);

  // 第三段：参与须知
  var notice = "【参与须知】\n";
  notice += "- 请提前阅读相关章节或准备分享内容\n";
  notice += "- 保持开放心态，尊重不同观点\n";
  notice += "- 活动开始前 15 分钟会发送提醒\n";
  if (format === "offline" && city) {
    notice += "- 线下活动请注意交通安全，具体地点确认后通知\n";
  }
  if (format === "online_video" || format === "online_voice") {
    notice += "- 请确保网络稳定，建议提前测试设备\n";
  }
  paragraphs.push(notice);

  // 自定义备注
  if (customNote) {
    paragraphs.push("【发起人备注】\n" + customNote);
  }

  return paragraphs.join("\n\n");
}

/**
 * 生成讨论话题
 */
function _generateDiscussionTopics(bookName, genre, bookMode) {
  var genreLabel = GENRE_LABELS[genre] || "阅读";
  var topics = [];

  if (bookName) {
    topics = [
      "《" + bookName + "》中最打动你的片段是什么？为什么？",
      "你认为作者在《" + bookName + "》中想传达的核心主题是什么？",
      "书中的哪个角色与你最相似？哪个角色最让你意外？",
      "如果可以改写《" + bookName + "》的结局，你会怎么改？",
      "这本书与你之前读过的同类作品相比，有什么独特之处？",
    ];
  } else {
    // 按类型生成通用话题
    var topicPool = {
      literature: [
        "最近读过最让你共鸣的一本文学作品是什么？",
        "你认为好的文学作品应该具备哪些特质？",
        "阅读文学作品对你日常生活有什么影响？",
        "你更喜欢长篇还是短篇？为什么？",
        "有没有一本文学作品改变了你的世界观？",
      ],
      philosophy: [
        "哪位哲学家的思想对你影响最大？",
        "你认为哲学思考在日常生活中有什么实际价值？",
        "最近有什么哲学问题一直在困扰你？",
        "你如何看待理性与感性的关系？",
        "如果推荐一本哲学入门书，你会选哪本？",
      ],
      business: [
        "哪本商业书籍对你的职业影响最大？",
        "你认为当前最值得关注的商业趋势是什么？",
        "创业和打工，你更认同哪种生活方式？",
        "你如何平衡工作和个人成长？",
        "有没有一个商业案例让你特别佩服？",
      ],
      psychology: [
        "心理学书籍中哪个概念让你印象最深？",
        "你认为自我认知对个人成长有多重要？",
        "你有没有通过阅读心理学书籍解决过实际问题？",
        "你如何看待积极心理学的观点？",
        "推荐一本你觉得人人都该读的心理学书。",
      ],
      tech: [
        "技术书籍中哪本对你的编程思维影响最大？",
        "你如何看待 AI 对程序员职业的影响？",
        "学习新技术时你更偏好读书还是实践？",
        "有没有一个技术概念你花了很久才理解？",
        "你认为未来 5 年最值得投资的技术方向是什么？",
      ],
    };

    topics = topicPool[genre] || [
      "你最近在读什么书？感觉如何？",
      genreLabel + "领域你最推荐哪本书？为什么？",
      "阅读" + genreLabel + "类书籍给你带来了什么改变？",
      "你是如何选书的？有什么选书标准吗？",
      "你理想中的读书搭子是什么样的？",
    ];
  }

  // 如果是主题选书或自由选书模式，增加对比类话题
  if (bookMode === "theme" || bookMode === "free") {
    topics.push("大家各自选的书有什么共同的主题或视角？");
    topics.push("不同书籍之间的观点有没有冲突的地方？");
  }

  return topics.slice(0, 5);
}

/**
 * 生成活动标签
 */
function _generateActivityTags(genre, format, bookMode, level, city) {
  var tags = [];
  if (genre) tags.push(GENRE_LABELS[genre] || genre);
  if (format) tags.push(FORMAT_LABELS[format] || format);
  if (bookMode) tags.push(BOOK_MODE_LABELS[bookMode] || bookMode);
  if (level) tags.push(LEVEL_LABELS[level] || level);
  if (city && city !== "online") tags.push(city);
  tags.push("读书会");
  return tags;
}

/**
 * 生成阅读准备建议
 */
function _generatePrepTips(bookName, genre, format) {
  var tips = [];
  if (bookName) {
    tips.push("建议至少阅读《" + bookName + "》的前 3 章");
    tips.push("准备 2-3 个你最有感触的段落或金句");
    tips.push("想一个与本书相关的个人经历或思考");
  } else {
    tips.push("准备一本近期在读或读过的" + (GENRE_LABELS[genre] || "") + "类书籍");
    tips.push("想好一段 2 分钟的书籍分享内容");
  }
  if (format === "offline") {
    tips.push("带上一本你喜欢的书（方便现场推荐）");
  }
  if (format === "online_video" || format === "online_voice") {
    tips.push("提前检查网络和设备");
    tips.push("找一个安静的环境参与活动");
  }
  return tips;
}

/**
 * 建议活动时长
 */
function _suggestDuration(format) {
  var durations = {
    offline: 120,
    online_video: 90,
    online_voice: 75,
    chat: 60,
    hybrid: 120,
  };
  return durations[format] || 90;
}

// ─────────────────────────────────────────────────────────
// 3. moderateContent - 内容审核
// ─────────────────────────────────────────────────────────

/**
 * 对文本内容进行安全审核。
 *
 * @param {string} text - 待审核的文本内容
 * @param {Object} fields - 额外字段（如 title, description）
 * @returns {Object} 审核结果
 */
function moderateContent(text, fields) {
  if (!text && !fields) {
    return {
      verdict: "auto_passed",
      risks: [],
      score: 100,
      details: "无内容需要审核",
    };
  }

  // 合并所有文本
  var allText = text || "";
  if (fields) {
    Object.keys(fields).forEach(function (k) {
      if (typeof fields[k] === "string") {
        allText += " " + fields[k];
      }
    });
  }

  var risks = [];
  var deductions = 0;

  // ── 手机号检测 ──
  var phoneRegex = /1[3-9]\d{9}/g;
  var phoneMatches = allText.match(phoneRegex);
  if (phoneMatches && phoneMatches.length > 0) {
    risks.push({
      type: "phone_number",
      severity: "high",
      found: phoneMatches,
      message: "检测到手机号码（" + phoneMatches.length + "个），请勿在内容中暴露联系方式",
    });
    deductions += 25 * phoneMatches.length;
  }

  // ── 微信号检测 ──
  var wechatRegex = /微信|wx[_\d]{3,}/gi;
  var wechatMatches = allText.match(wechatRegex);
  if (wechatMatches && wechatMatches.length > 0) {
    risks.push({
      type: "wechat_id",
      severity: "medium",
      found: wechatMatches,
      message: "检测到微信相关信息，请避免引导添加私人微信",
    });
    deductions += 15 * wechatMatches.length;
  }

  // ── QQ号检测 ──
  var qqRegex = /qq[_\d]{5,}/gi;
  var qqMatches = allText.match(qqRegex);
  if (qqMatches && qqMatches.length > 0) {
    risks.push({
      type: "qq_id",
      severity: "medium",
      found: qqMatches,
      message: "检测到QQ相关信息，请避免引导添加QQ",
    });
    deductions += 15 * qqMatches.length;
  }

  // ── 敏感词检测 ──
  var blockedFound = [];
  BLOCKED_TERMS.forEach(function (term) {
    if (allText.indexOf(term) >= 0) {
      blockedFound.push(term);
    }
  });
  if (blockedFound.length > 0) {
    risks.push({
      type: "blocked_term",
      severity: "high",
      found: blockedFound,
      message: "检测到违禁词：「" + blockedFound.join("」「") + "」",
    });
    deductions += 20 * blockedFound.length;
  }

  // ── URL检测 ──
  var urlRegex = /https?:\/\/[^\s]+/gi;
  var urlMatches = allText.match(urlRegex);
  if (urlMatches && urlMatches.length > 0) {
    risks.push({
      type: "external_url",
      severity: "low",
      found: urlMatches,
      message: "检测到外部链接，请确认链接安全性",
    });
    deductions += 5 * urlMatches.length;
  }

  // ── 过长连续无空格文本（可能是乱码或注入） ──
  var longNoSpaceRegex = /\S{80,}/g;
  if (longNoSpaceRegex.test(allText)) {
    risks.push({
      type: "suspicious_format",
      severity: "low",
      found: [],
      message: "检测到异常长文本段落，可能存在注入风险",
    });
    deductions += 10;
  }

  // ── 重复字符检测（如 "啊啊啊啊啊..."） ──
  var repeatRegex = /(.)\1{9,}/g;
  if (repeatRegex.test(allText)) {
    risks.push({
      type: "spam_pattern",
      severity: "low",
      found: [],
      message: "检测到重复字符模式，可能为无意义内容",
    });
    deductions += 5;
  }

  // ── 计算安全评分 ──
  var score = clamp(100 - deductions);

  // ── 判定结果 ──
  var verdict;
  var highRisks = risks.filter(function (r) { return r.severity === "high"; });
  var medRisks = risks.filter(function (r) { return r.severity === "medium"; });

  if (highRisks.length > 0 || score < 30) {
    verdict = "blocked";
  } else if (medRisks.length > 0 || score < 70) {
    verdict = "needs_review";
  } else {
    verdict = "auto_passed";
  }

  return {
    verdict: verdict,
    risks: risks,
    score: score,
    details: risks.length > 0
      ? "发现 " + risks.length + " 项风险，安全评分 " + score + "/100"
      : "内容安全，评分 " + score + "/100",
    highRiskCount: highRisks.length,
    mediumRiskCount: medRisks.length,
    lowRiskCount: risks.length - highRisks.length - medRisks.length,
  };
}

// ─────────────────────────────────────────────────────────
// 4. explainMatch - 匹配解释
// ─────────────────────────────────────────────────────────

/**
 * 解释活动与用户的匹配程度。
 *
 * @param {Object} activity - 活动对象
 * @param {Object} user - 用户对象
 * @param {Object} scoreBreakdown - 各维度评分明细
 * @returns {Object} 匹配解释
 */
function explainMatch(activity, user, scoreBreakdown) {
  if (!activity || !user) {
    return {
      summary: "缺少活动或用户信息，无法生成匹配解释。",
      strengths: [],
      risks: [],
      matchLevel: "D",
    };
  }

  var breakdown = scoreBreakdown || {};
  var totalScore = breakdown.totalScore || 0;
  var matchLevel = scoreToGrade(totalScore);

  // ── 匹配优势 ──
  var strengths = [];
  var userGenres = ensureArray(user.genres);
  var actGenres = ensureArray(activity.genres);
  var commonGenres = intersect(userGenres, actGenres);

  if (commonGenres.length > 0) {
    var names = commonGenres.map(function (g) { return GENRE_LABELS[g] || g; });
    strengths.push("类型匹配：你们都关注" + names.join("、"));
  }

  if (user.readingLevel && activity.readingLevel && user.readingLevel === activity.readingLevel) {
    strengths.push("水平一致：你们处于相似的阅读阶段，交流更容易");
  }

  var userFormats = ensureArray(user.preferredFormats);
  if (userFormats.indexOf(activity.format) >= 0) {
    strengths.push("形式偏好：活动形式符合你的偏好");
  }

  var userSlots = ensureArray(user.availableSlots);
  if (activity.timeSlot && userSlots.indexOf(activity.timeSlot) >= 0) {
    strengths.push("时间契合：活动时间在你的空闲时段内");
  }

  if (user.city && activity.city && user.city === activity.city) {
    strengths.push("同城便利：你们在同一个城市");
  }

  if (breakdown.safetyScore >= 80) {
    strengths.push("内容安全：活动内容通过了安全审核");
  }

  if (breakdown.reliabilityScore >= 70) {
    strengths.push("发起人可信：活动发起人信用评分良好");
  }

  // ── 潜在风险 ──
  var risks = [];

  if (commonGenres.length === 0 && actGenres.length > 0) {
    risks.push("类型不匹配：活动主题不在你的偏好列表中");
  }

  if (user.readingLevel && activity.readingLevel) {
    var levelOrder = ["beginner", "casual", "regular", "avid", "expert"];
    var userIdx = levelOrder.indexOf(user.readingLevel);
    var actIdx = levelOrder.indexOf(activity.readingLevel);
    if (Math.abs(userIdx - actIdx) >= 2) {
      risks.push("水平差距：活动要求的阅读水平与你有一定差距");
    }
  }

  if (user.city && activity.city && user.city !== activity.city && activity.format === "offline") {
    risks.push("异地限制：这是一个线下活动，但你不在活动所在城市");
  }

  if (breakdown.safetyScore < 60) {
    risks.push("内容存疑：活动内容的安全评分偏低，请注意甄别");
  }

  if (breakdown.reliabilityScore < 40) {
    risks.push("信用提醒：活动发起人的信用评分较低，建议谨慎参与");
  }

  // ── 总结 ──
  var summary = "";
  if (matchLevel === "S") {
    summary = "这个读书活动与你的偏好高度匹配，各方面条件都非常理想，强烈推荐参加！";
  } else if (matchLevel === "A") {
    summary = "这个活动与你的阅读兴趣和时间安排都比较吻合，是一个不错的选择。";
  } else if (matchLevel === "B") {
    summary = "活动与你的偏好有一定匹配，部分维度还可以，可以关注看看。";
  } else if (matchLevel === "C") {
    summary = "匹配度一般，有一些方面不太符合你的偏好，但如果感兴趣也可以尝试。";
  } else {
    summary = "这个活动与你的偏好匹配度较低，建议看看其他更适合的活动。";
  }

  return {
    summary: summary,
    strengths: strengths.length > 0 ? strengths : ["暂无明显匹配优势"],
    risks: risks,
    matchLevel: matchLevel,
    totalScore: totalScore,
    breakdown: breakdown,
  };
}

// ─────────────────────────────────────────────────────────
// 5. scoreActivity - AI 质量评分
// ─────────────────────────────────────────────────────────

/**
 * 对活动进行 5 维度综合评分。
 *
 * 维度权重：
 *   - matchScore (匹配度): 36%
 *   - safetyScore (安全性): 22%
 *   - profileScore (发起人资料): 16%
 *   - qualityScore (内容质量): 16%
 *   - reliabilityScore (可靠度): 10%
 *
 * @param {Object} activity - 活动对象
 * @param {Object} user - 当前用户对象
 * @returns {Object} 评分结果
 */
function scoreActivity(activity, user) {
  if (!activity) {
    return _emptyScoreResult("活动信息缺失");
  }

  // ── 1. 匹配度评分 (36%) ──
  var matchScore = _calcMatchScore(activity, user);

  // ── 2. 安全评分 (22%) ──
  var safetyResult = moderateContent(
    activity.description || "",
    { title: activity.title, location: activity.location }
  );
  var safetyScore = safetyResult.score;

  // ── 3. 发起人资料完整度 (16%) ──
  var creator = activity.creator || activity.creatorProfile || {};
  var profileScore = _calcProfileScore(creator);

  // ── 4. 活动内容质量 (16%) ──
  var qualityScore = _calcQualityScore(activity);

  // ── 5. 可靠度评分 (10%) ──
  var reliabilityScore = _calcReliabilityScore(activity, creator);

  // ── 加权总分 ──
  var totalScore = Math.round(
    matchScore * 0.36 +
    safetyScore * 0.22 +
    profileScore * 0.16 +
    qualityScore * 0.16 +
    reliabilityScore * 0.10
  );

  var grade = scoreToGrade(totalScore);

  return {
    totalScore: clamp(totalScore),
    grade: grade,
    dimensions: {
      matchScore: { score: clamp(matchScore), weight: 0.36, weighted: Math.round(matchScore * 0.36), label: "匹配度" },
      safetyScore: { score: clamp(safetyScore), weight: 0.22, weighted: Math.round(safetyScore * 0.22), label: "安全性" },
      profileScore: { score: clamp(profileScore), weight: 0.16, weighted: Math.round(profileScore * 0.16), label: "发起人资料" },
      qualityScore: { score: clamp(qualityScore), weight: 0.16, weighted: Math.round(qualityScore * 0.16), label: "内容质量" },
      reliabilityScore: { score: clamp(reliabilityScore), weight: 0.10, weighted: Math.round(reliabilityScore * 0.10), label: "可靠度" },
    },
    safetyDetail: safetyResult,
    explanation: explainMatch(activity, user, {
      totalScore: totalScore,
      matchScore: matchScore,
      safetyScore: safetyScore,
      profileScore: profileScore,
      qualityScore: qualityScore,
      reliabilityScore: reliabilityScore,
    }),
    scoredAt: nowMs(),
  };
}

/**
 * 计算匹配度评分
 */
function _calcMatchScore(activity, user) {
  if (!user) return 50; // 无用户信息给中间分

  var score = 0;
  var factors = 0;

  // 类型匹配 (权重最高)
  var userGenres = ensureArray(user.genres);
  var actGenres = ensureArray(activity.genres);
  if (userGenres.length > 0 && actGenres.length > 0) {
    var common = intersect(userGenres, actGenres);
    var genreRatio = common.length / Math.max(userGenres.length, actGenres.length);
    score += genreRatio * 40;
    factors += 40;
  } else {
    score += 20; // 缺少信息给基础分
    factors += 40;
  }

  // 等级匹配
  if (user.readingLevel && activity.readingLevel) {
    if (user.readingLevel === activity.readingLevel) {
      score += 25;
    } else {
      var levelOrder = ["beginner", "casual", "regular", "avid", "expert"];
      var uIdx = levelOrder.indexOf(user.readingLevel);
      var aIdx = levelOrder.indexOf(activity.readingLevel);
      var diff = Math.abs(uIdx - aIdx);
      if (diff === 1) score += 18;
      else if (diff === 2) score += 8;
      else score += 0;
    }
    factors += 25;
  } else {
    score += 12;
    factors += 25;
  }

  // 时间匹配
  var userSlots = ensureArray(user.availableSlots);
  if (activity.timeSlot && userSlots.length > 0) {
    if (userSlots.indexOf(activity.timeSlot) >= 0 || userSlots.indexOf("flexible") >= 0) {
      score += 15;
    } else {
      score += 3;
    }
    factors += 15;
  } else {
    score += 8;
    factors += 15;
  }

  // 形式匹配
  var userFormats = ensureArray(user.preferredFormats);
  if (activity.format && userFormats.length > 0) {
    if (userFormats.indexOf(activity.format) >= 0) {
      score += 10;
    } else {
      score += 2;
    }
    factors += 10;
  } else {
    score += 5;
    factors += 10;
  }

  // 城市匹配
  if (user.city && activity.city) {
    if (user.city === activity.city) {
      score += 10;
    } else if (activity.format !== "offline") {
      score += 7; // 线上活动不受城市限制
    } else {
      score += 0;
    }
    factors += 10;
  } else {
    score += 5;
    factors += 10;
  }

  return factors > 0 ? (score / factors) * 100 : 50;
}

/**
 * 计算发起人资料完整度评分
 */
function _calcProfileScore(creator) {
  if (!creator || Object.keys(creator).length === 0) return 30;

  var score = 0;
  if (creator.nickname) score += 10;
  if (creator.avatarUrl) score += 8;
  if (ensureArray(creator.genres).length > 0) score += 15;
  if (creator.readingLevel) score += 12;
  if (creator.city) score += 8;
  if ((creator.bio || "").length >= 10) score += 15;
  if (ensureArray(creator.favoriteBooks).length > 0) score += 10;
  if (creator.monthlyBookCount > 0) score += 7;
  if (ensureArray(creator.availableSlots).length > 0) score += 8;
  if (ensureArray(creator.preferredFormats).length > 0) score += 7;

  return clamp(score);
}

/**
 * 计算活动内容质量评分
 */
function _calcQualityScore(activity) {
  var score = 0;
  var desc = activity.description || "";
  var title = activity.title || "";

  // 标题长度
  if (title.length >= 5 && title.length <= 50) {
    score += 15;
  } else if (title.length >= 3) {
    score += 8;
  }

  // 描述长度
  if (desc.length >= 200) {
    score += 25;
  } else if (desc.length >= 100) {
    score += 18;
  } else if (desc.length >= 50) {
    score += 10;
  } else if (desc.length >= 20) {
    score += 5;
  }

  // 描述结构化（有段落标记、标点符号）
  var hasParagraphs = (desc.match(/\n/g) || []).length >= 2;
  var hasPunctuation = /[，。！？、；：]/.test(desc);
  var hasNumberedList = /\d[.、)]/.test(desc);
  var hasBrackets = /【|】|\[|\]/.test(desc);

  if (hasParagraphs) score += 10;
  if (hasPunctuation) score += 8;
  if (hasNumberedList) score += 8;
  if (hasBrackets) score += 5;

  // 有明确的活动信息
  if (activity.startTime || activity.startAt) score += 8;
  if (activity.location || activity.address) score += 5;
  if (activity.maxMembers && activity.maxMembers > 0) score += 5;
  if (activity.genres && activity.genres.length > 0) score += 5;
  if (activity.bookName || activity.book) score += 6;

  return clamp(score);
}

/**
 * 计算可靠度评分
 */
function _calcReliabilityScore(activity, creator) {
  var score = 50; // 基础分

  // 发起人历史活动数
  var actCount = safeGet(creator, "activityCount", 0) || safeGet(activity, "creatorActivityCount", 0);
  if (actCount >= 10) score += 20;
  else if (actCount >= 5) score += 15;
  else if (actCount >= 2) score += 10;
  else if (actCount >= 1) score += 5;

  // 发起人好评率
  var goodRate = safeGet(creator, "goodRate", 0) || safeGet(activity, "creatorGoodRate", 0);
  if (goodRate >= 0.9) score += 15;
  else if (goodRate >= 0.7) score += 10;
  else if (goodRate >= 0.5) score += 5;

  // 实名认证
  var verified = safeGet(creator, "verified", false) || safeGet(activity, "creatorVerified", false);
  if (verified) score += 10;

  // 注册时间（老用户加分）
  var regTime = safeGet(creator, "createdAt", null) || safeGet(activity, "creatorCreatedAt", null);
  if (regTime) {
    var regDate = typeof regTime === "string" ? new Date(regTime) : regTime;
    if (regDate.toDate) regDate = regDate.toDate();
    var daysSince = (nowMs() - regDate.getTime()) / 86400000;
    if (daysSince >= 365) score += 10;
    else if (daysSince >= 180) score += 7;
    else if (daysSince >= 30) score += 3;
  }

  // 扣分项：有举报记录
  var reportCount = safeGet(creator, "reportCount", 0) || safeGet(activity, "creatorReportCount", 0);
  if (reportCount > 0) score -= 15 * reportCount;

  return clamp(score);
}

/**
 * 空评分结果
 */
function _emptyScoreResult(reason) {
  return {
    totalScore: 0,
    grade: "D",
    dimensions: {
      matchScore: { score: 0, weight: 0.36, weighted: 0, label: "匹配度" },
      safetyScore: { score: 0, weight: 0.22, weighted: 0, label: "安全性" },
      profileScore: { score: 0, weight: 0.16, weighted: 0, label: "发起人资料" },
      qualityScore: { score: 0, weight: 0.16, weighted: 0, label: "内容质量" },
      reliabilityScore: { score: 0, weight: 0.10, weighted: 0, label: "可靠度" },
    },
    safetyDetail: { verdict: "auto_passed", risks: [], score: 0 },
    explanation: { summary: reason || "无法评分", strengths: [], risks: [], matchLevel: "D" },
    scoredAt: nowMs(),
  };
}

// ─────────────────────────────────────────────────────────
// 6. triageReport - 举报严重度分类
// ─────────────────────────────────────────────────────────

/**
 * 对举报进行严重度分类和处置建议。
 *
 * @param {Object} report - 举报对象
 * @returns {Object} 分类结果
 */
function triageReport(report) {
  if (!report) {
    return {
      severity: "low",
      category: "other",
      categoryLabel: "其他问题",
      suggestedAction: "人工审核",
      confidence: 30,
      reasoning: "举报信息不完整",
    };
  }

  var category = report.category || "other";
  var description = report.description || report.reason || "";
  var evidence = ensureArray(report.evidence || report.attachments);
  var target = report.targetType || "activity"; // activity | user | comment

  // ── 基础严重度 ──
  var catInfo = REPORT_CATEGORIES[category] || REPORT_CATEGORIES.other;
  var severity = catInfo.baseSeverity;
  var confidence = 50;

  // ── 关键词增强 ──
  var highKeywords = ["威胁", "暴力", "人身", "骚扰", "恐吓", "跟踪", "诈骗", "骗钱", "色情", "未成年"];
  var medKeywords = ["广告", "引流", "虚假", "不实", "抄袭", "盗图", "低俗"];

  var highFound = highKeywords.filter(function (k) { return description.indexOf(k) >= 0; });
  var medFound = medKeywords.filter(function (k) { return description.indexOf(k) >= 0; });

  if (highFound.length > 0) {
    severity = "high";
    confidence = Math.min(95, confidence + 20 * highFound.length);
  } else if (medFound.length > 0) {
    if (severity === "low") severity = "medium";
    confidence = Math.min(90, confidence + 15 * medFound.length);
  }

  // ── 证据增强 ──
  if (evidence.length >= 3) {
    confidence = Math.min(95, confidence + 15);
  } else if (evidence.length >= 1) {
    confidence = Math.min(90, confidence + 10);
  }

  // ── 描述长度增强 ──
  if (description.length >= 100) {
    confidence = Math.min(95, confidence + 10);
  } else if (description.length >= 50) {
    confidence = Math.min(90, confidence + 5);
  } else if (description.length < 10) {
    confidence = Math.max(20, confidence - 20);
  }

  // ── 处置建议 ──
  var suggestedAction;
  if (severity === "high") {
    if (category === "harassment" || category === "safety") {
      suggestedAction = "立即下架活动并通知运营团队，必要时报警处理";
    } else if (category === "fraud") {
      suggestedAction = "冻结相关活动，联系涉事用户核实情况";
    } else {
      suggestedAction = "优先人工审核，24 小时内处理";
    }
  } else if (severity === "medium") {
    suggestedAction = "排入审核队列，48 小时内处理";
    if (category === "spam") {
      suggestedAction = "检查是否为批量广告行为，必要时限制账号功能";
    }
  } else {
    suggestedAction = "进入常规审核队列，按优先级处理";
    if (description.length < 10) {
      suggestedAction = "举报描述过于简略，建议联系举报人补充信息后再处理";
    }
  }

  return {
    severity: severity,
    category: category,
    categoryLabel: catInfo.label,
    suggestedAction: suggestedAction,
    confidence: clamp(confidence),
    reasoning: _buildTriageReasoning(category, severity, highFound, medFound, evidence.length, description.length),
    highKeywords: highFound,
    mediumKeywords: medFound,
    evidenceCount: evidence.length,
    descriptionLength: description.length,
  };
}

/**
 * 构建分类推理说明
 */
function _buildTriageReasoning(category, severity, highFound, medFound, evidenceCount, descLen) {
  var parts = [];
  parts.push("举报类别：" + (REPORT_CATEGORIES[category] || {}).label || category);
  parts.push("基础严重度：" + severity);

  if (highFound.length > 0) {
    parts.push("检测到高风险关键词：「" + highFound.join("」「") + "」");
  }
  if (medFound.length > 0) {
    parts.push("检测到中风险关键词：「" + medFound.join("」「") + "」");
  }

  parts.push("证据数量：" + evidenceCount + "项");
  parts.push("描述长度：" + descLen + "字");

  return parts.join("；");
}

// ─────────────────────────────────────────────────────────
// 7. reviewHint - 申请审核建议
// ─────────────────────────────────────────────────────────

/**
 * 为活动发起人提供申请审核建议。
 *
 * @param {Object} applicant - 申请者对象
 * @param {Object} activity - 活动对象
 * @returns {Object} 审核建议
 */
function reviewHint(applicant, activity) {
  if (!applicant || !activity) {
    return {
      suggestion: "observe",
      reasons: ["申请者或活动信息不完整，建议人工判断"],
      riskFactors: [],
      confidence: 30,
    };
  }

  var score = 50; // 基础分
  var reasons = [];
  var riskFactors = [];

  // ── 资料完整度 ──
  var completeness = _calcCompleteness(applicant);
  if (completeness >= 70) {
    score += 15;
    reasons.push("申请者资料完整度高（" + completeness + "%）");
  } else if (completeness >= 40) {
    score += 5;
    reasons.push("申请者资料基本完整（" + completeness + "%）");
  } else {
    score -= 10;
    riskFactors.push("申请者资料不够完整（" + completeness + "%），信息有限");
  }

  // ── 类型匹配度 ──
  var applicantGenres = ensureArray(applicant.genres);
  var actGenres = ensureArray(activity.genres);
  var genreMatch = intersect(applicantGenres, actGenres);
  if (genreMatch.length > 0) {
    score += 10;
    reasons.push("阅读类型匹配（" + genreMatch.length + "个共同类型）");
  } else if (applicantGenres.length > 0 && actGenres.length > 0) {
    score -= 5;
    riskFactors.push("阅读类型无交集");
  }

  // ── 等级匹配度 ──
  if (applicant.readingLevel && activity.readingLevel) {
    if (applicant.readingLevel === activity.readingLevel) {
      score += 8;
      reasons.push("阅读等级一致");
    } else {
      var levelOrder = ["beginner", "casual", "regular", "avid", "expert"];
      var diff = Math.abs(levelOrder.indexOf(applicant.readingLevel) - levelOrder.indexOf(activity.readingLevel));
      if (diff <= 1) {
        score += 4;
        reasons.push("阅读等级相近");
      } else {
        riskFactors.push("阅读等级差距较大（差" + diff + "级）");
      }
    }
  }

  // ── 历史参与度 ──
  var historyCount = applicant.attendedCount || applicant.activityCount || 0;
  if (historyCount >= 5) {
    score += 10;
    reasons.push("有丰富的活动参与经验（" + historyCount + "次）");
  } else if (historyCount >= 2) {
    score += 5;
    reasons.push("有一定活动参与经验");
  } else if (historyCount === 0) {
    // 新用户不扣分，但标记
    reasons.push("新用户，首次参与活动");
  }

  // ── 好评率 ──
  var goodRate = applicant.goodRate || 0;
  if (goodRate >= 0.8 && historyCount >= 2) {
    score += 10;
    reasons.push("历史好评率" + Math.round(goodRate * 100) + "%");
  } else if (goodRate < 0.5 && historyCount >= 2) {
    score -= 15;
    riskFactors.push("历史好评率偏低（" + Math.round(goodRate * 100) + "%）");
  }

  // ── 缺席记录 ──
  var noShowCount = applicant.noShowCount || 0;
  if (noShowCount >= 3) {
    score -= 20;
    riskFactors.push("有" + noShowCount + "次缺席记录，请注意确认");
  } else if (noShowCount >= 1) {
    score -= 8;
    riskFactors.push("有" + noShowCount + "次缺席记录");
  }

  // ── 申请留言质量 ──
  var message = applicant.applicationMessage || applicant.message || "";
  if (message.length >= 30) {
    score += 8;
    reasons.push("申请留言内容丰富，态度认真");
  } else if (message.length >= 10) {
    score += 3;
  } else if (message.length > 0) {
    // 留言很短
    riskFactors.push("申请留言过于简短");
  }

  // ── 举报记录 ──
  var reports = applicant.reportCount || 0;
  if (reports > 0) {
    score -= 15 * reports;
    riskFactors.push("有" + reports + "次被举报记录");
  }

  // ── 账号年龄 ──
  var createdAt = applicant.createdAt;
  if (createdAt) {
    var regDate = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    if (regDate.toDate) regDate = regDate.toDate();
    var ageDays = (nowMs() - regDate.getTime()) / 86400000;
    if (ageDays < 1) {
      riskFactors.push("今日新注册账号");
      score -= 5;
    } else if (ageDays >= 30) {
      score += 3;
    }
  }

  // ── 生成建议 ──
  score = clamp(score);
  var suggestion;
  if (score >= 65 && riskFactors.length === 0) {
    suggestion = "accept";
  } else if (score >= 45 || riskFactors.length <= 1) {
    suggestion = "observe";
  } else {
    suggestion = "reject";
  }

  // 如果有严重风险因素，直接降级
  var severeRisks = riskFactors.filter(function (r) {
    return r.indexOf("举报") >= 0 || r.indexOf("缺席") >= 0;
  });
  if (severeRisks.length >= 2) {
    suggestion = "reject";
  }

  var confidence = 40 + Math.min(50, Math.abs(score - 50));

  return {
    suggestion: suggestion,
    score: score,
    reasons: reasons.length > 0 ? reasons : ["无特别优势或风险"],
    riskFactors: riskFactors,
    confidence: clamp(confidence),
    suggestionLabel: suggestion === "accept" ? "建议通过"
      : suggestion === "observe" ? "建议观察"
        : "建议拒绝",
  };
}

// ─────────────────────────────────────────────────────────
// 8. buildAiWorkbench - AI 工作台
// ─────────────────────────────────────────────────────────

/**
 * 构建综合 AI 分析仪表盘。
 *
 * @param {Array} activities - 活动列表
 * @param {Object} user - 当前用户
 * @param {Object} stats - 统计信息
 * @returns {Object} 仪表盘数据
 */
function buildAiWorkbench(activities, user, stats) {
  var actList = ensureArray(activities);
  var statObj = stats || {};

  // ── 1. 画像完整度维度 ──
  var profileResult = analyzeProfile(user);

  // ── 2. 活动安全评分维度 ──
  var safetyQueue = [];
  var safetyScores = [];
  actList.forEach(function (act) {
    var result = moderateContent(
      act.description || "",
      { title: act.title }
    );
    safetyScores.push(result.score);
    if (result.verdict !== "auto_passed") {
      safetyQueue.push({
        activityId: act._id || act.id,
        title: act.title || "未命名活动",
        verdict: result.verdict,
        score: result.score,
        risks: result.risks,
      });
    }
  });
  var avgSafety = safetyScores.length > 0
    ? Math.round(safetyScores.reduce(function (a, b) { return a + b; }, 0) / safetyScores.length)
    : 100;

  // ── 3. 匹配质量维度 ──
  var matchScores = [];
  var topMatches = [];
  actList.forEach(function (act) {
    var result = scoreActivity(act, user);
    matchScores.push(result.totalScore);
    if (result.grade === "S" || result.grade === "A") {
      topMatches.push({
        activityId: act._id || act.id,
        title: act.title || "未命名活动",
        score: result.totalScore,
        grade: result.grade,
      });
    }
  });
  var avgMatch = matchScores.length > 0
    ? Math.round(matchScores.reduce(function (a, b) { return a + b; }, 0) / matchScores.length)
    : 0;

  // ── 4. 活跃度维度 ──
  var activityScore = _calcActivityDimension(statObj, actList);

  // ── 5. 社交网络维度 ──
  var socialScore = _calcSocialDimension(statObj, user);

  // ── 6. 成长性维度 ──
  var growthScore = _calcGrowthDimension(statObj, user);

  // ── 汇总维度 ──
  var dimensions = [
    { key: "profile", label: "画像完整度", score: profileResult.completenessScore, icon: "👤", status: _dimStatus(profileResult.completenessScore) },
    { key: "safety", label: "内容安全", score: avgSafety, icon: "🛡️", status: _dimStatus(avgSafety) },
    { key: "match", label: "匹配质量", score: avgMatch, icon: "🎯", status: _dimStatus(avgMatch) },
    { key: "activity", label: "活跃程度", score: activityScore, icon: "📊", status: _dimStatus(activityScore) },
    { key: "social", label: "社交网络", score: socialScore, icon: "🤝", status: _dimStatus(socialScore) },
    { key: "growth", label: "成长轨迹", score: growthScore, icon: "📈", status: _dimStatus(growthScore) },
  ];

  // ── 优先行动项 ──
  var priorities = _buildPriorities(profileResult, safetyQueue, topMatches, statObj);

  return {
    dimensions: dimensions,
    overallScore: _calcOverallScore(dimensions),
    profileInsight: profileResult,
    topMatches: topMatches.slice(0, 5),
    safetyQueue: safetyQueue,
    priorities: priorities,
    stats: {
      totalActivities: actList.length,
      avgMatchScore: avgMatch,
      avgSafetyScore: avgSafety,
      pendingReview: safetyQueue.length,
    },
    generatedAt: nowMs(),
  };
}

/**
 * 计算活跃度维度
 */
function _calcActivityDimension(stats, activities) {
  var score = 30; // 基础分
  var createdCount = stats.createdCount || 0;
  var joinedCount = stats.joinedCount || stats.attendedCount || 0;
  var totalParticipation = createdCount + joinedCount;

  if (totalParticipation >= 20) score += 40;
  else if (totalParticipation >= 10) score += 30;
  else if (totalParticipation >= 5) score += 20;
  else if (totalParticipation >= 1) score += 10;

  // 近期活跃度
  var recentActs = activities.filter(function (a) {
    var t = a.createdAt || a.startAt;
    if (!t) return false;
    var d = typeof t === "string" ? new Date(t) : t;
    if (d.toDate) d = d.toDate();
    return (nowMs() - d.getTime()) < 30 * 86400000; // 30 天内
  });
  if (recentActs.length >= 5) score += 20;
  else if (recentActs.length >= 2) score += 10;

  return clamp(score);
}

/**
 * 计算社交网络维度
 */
function _calcSocialDimension(stats, user) {
  var score = 20;
  var connections = stats.connections || stats.matchCount || 0;
  var reviewsGiven = stats.reviewsGiven || 0;
  var reviewsReceived = stats.reviewsReceived || 0;

  if (connections >= 10) score += 30;
  else if (connections >= 5) score += 20;
  else if (connections >= 1) score += 10;

  if (reviewsReceived >= 5) score += 20;
  else if (reviewsReceived >= 2) score += 10;

  if (reviewsGiven >= 3) score += 15;
  else if (reviewsGiven >= 1) score += 8;

  // 好友互动
  if (stats.repeatMatches || stats.repeatPartners) {
    score += 15;
  }

  return clamp(score);
}

/**
 * 计算成长性维度
 */
function _calcGrowthDimension(stats, user) {
  var score = 25;

  // 阅读数量增长
  if (stats.bookCountGrowth || stats.readingTrend === "up") score += 20;

  // 类型探索
  var genresExplored = stats.genresExplored || ensureArray(user && user.genres).length;
  if (genresExplored >= 4) score += 20;
  else if (genresExplored >= 2) score += 10;

  // 等级提升
  if (stats.levelUp || stats.levelChanged) score += 15;

  // 持续活跃
  var streak = stats.streak || stats.consecutiveWeeks || 0;
  if (streak >= 4) score += 20;
  else if (streak >= 2) score += 10;

  return clamp(score);
}

/**
 * 维度状态标签
 */
function _dimStatus(score) {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "needs_work";
}

/**
 * 计算综合分数
 */
function _calcOverallScore(dimensions) {
  if (!dimensions || dimensions.length === 0) return 0;
  var total = dimensions.reduce(function (sum, d) { return sum + d.score; }, 0);
  return Math.round(total / dimensions.length);
}

/**
 * 构建优先行动项
 */
function _buildPriorities(profileResult, safetyQueue, topMatches, stats) {
  var priorities = [];

  // 画像完善建议
  if (profileResult.gaps.length > 0) {
    var highGap = profileResult.gaps.find(function (g) { return g.importance === "high"; });
    if (highGap) {
      priorities.push({
        type: "profile",
        priority: "high",
        title: "完善「" + highGap.label + "」",
        description: "完善个人资料可以显著提升匹配精度",
        action: "editProfile",
      });
    }
  }

  // 安全审核
  if (safetyQueue.length > 0) {
    priorities.push({
      type: "safety",
      priority: "high",
      title: safetyQueue.length + " 项内容待审核",
      description: "有活动内容未通过自动审核，需要人工确认",
      action: "reviewQueue",
    });
  }

  // 推荐活动
  if (topMatches.length > 0) {
    priorities.push({
      type: "match",
      priority: "medium",
      title: topMatches.length + " 个高匹配活动",
      description: "发现了与你偏好高度匹配的活动，去看看？",
      action: "viewRecommendations",
    });
  }

  // 鼓励创建
  var createdCount = stats.createdCount || 0;
  if (createdCount === 0) {
    priorities.push({
      type: "engagement",
      priority: "low",
      title: "发起你的第一个读书活动",
      description: "作为发起人组织活动，获得更丰富的阅读社交体验",
      action: "createActivity",
    });
  }

  // 写评价
  var pendingReviews = stats.pendingReviews || 0;
  if (pendingReviews > 0) {
    priorities.push({
      type: "feedback",
      priority: "low",
      title: pendingReviews + " 个活动等待评价",
      description: "为参加过的活动写下评价，帮助改善推荐",
      action: "writeReviews",
    });
  }

  return priorities.slice(0, 5);
}

// ─────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────

module.exports = {
  analyzeProfile: analyzeProfile,
  draftActivity: draftActivity,
  moderateContent: moderateContent,
  explainMatch: explainMatch,
  scoreActivity: scoreActivity,
  triageReport: triageReport,
  reviewHint: reviewHint,
  buildAiWorkbench: buildAiWorkbench,
};
