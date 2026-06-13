/**
 * 读书搭子小程序 - 云函数侧 AI 引擎
 *
 * 本文件在 utils/ai-core.js 的本地规则引擎基础上，
 * 增加了外部 AI（如大模型 API）的调用能力。
 *
 * 策略：
 *   1. 优先使用本地规则引擎（零延迟、零成本）
 *   2. 对于特定场景（activity_draft、profile_analysis）
 *      可调用外部 AI 获得更高质量结果
 *   3. 外部 AI 调用失败时自动回退到本地引擎
 *
 * 外部 AI 配置通过云环境变量注入：
 *   - AI_API_URL:   外部 AI 接口地址
 *   - AI_API_KEY:   API 密钥
 *   - AI_MODEL:     模型名称（默认 gpt-3.5-turbo）
 *   - AI_TIMEOUT:   超时毫秒（默认 8000）
 */

"use strict";

// 导入本地 AI 引擎
var localAi = require("./local-ai-core");

// ─────────────────────────────────────────────────────────
// 外部 AI 配置
// ─────────────────────────────────────────────────────────

var _config = null;

/**
 * 获取外部 AI 配置（从云环境变量读取）
 */
function getConfig(cloud) {
  if (_config) return _config;

  _config = {
    apiUrl: "",
    apiKey: "",
    model: "gpt-3.5-turbo",
    timeout: 8000,
    enabled: false,
  };

  // 尝试从环境变量读取
  try {
    var env = {};
    if (cloud && cloud.callFunction) {
      // 在云函数环境中尝试读取
      env = process.env || {};
    }
    _config.apiUrl = env.AI_API_URL || "";
    _config.apiKey = env.AI_API_KEY || "";
    _config.model = env.AI_MODEL || "gpt-3.5-turbo";
    _config.timeout = parseInt(env.AI_TIMEOUT || "8000", 10);
    _config.enabled = !!(_config.apiUrl && _config.apiKey);
  } catch (e) {
    console.warn("[ai-core] 无法读取环境变量，外部 AI 不可用", e.message);
  }

  return _config;
}

// ─────────────────────────────────────────────────────────
// 外部 AI 调用工具
// ─────────────────────────────────────────────────────────

/**
 * 调用外部 AI API（使用 wx-server-sdk 的 got 或原生 http）
 *
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} AI 返回结果
 */
async function callExternalAi(cloud, systemPrompt, userPrompt, options) {
  var config = getConfig(cloud);
  if (!config.enabled) {
    return { success: false, reason: "external_ai_disabled" };
  }

  var opt = options || {};
  var timeout = opt.timeout || config.timeout;
  var temperature = opt.temperature !== undefined ? opt.temperature : 0.7;
  var maxTokens = opt.maxTokens || 1500;

  var body = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: temperature,
    max_tokens: maxTokens,
  };

  try {
    // 使用 wx-server-sdk 内置的 got 发起请求
    var got = require("got");
    var response = await got.post(config.apiUrl, {
      json: body,
      headers: {
        "Authorization": "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      timeout: { request: timeout },
      responseType: "json",
    });

    var data = response.body;
    if (data && data.choices && data.choices.length > 0) {
      var content = data.choices[0].message.content;
      return {
        success: true,
        content: content,
        model: config.model,
        usage: data.usage || {},
      };
    }

    return { success: false, reason: "empty_response", raw: data };
  } catch (err) {
    console.error("[ai-core] 外部 AI 调用失败:", err.message);
    return { success: false, reason: "api_error", error: err.message };
  }
}

/**
 * 解析外部 AI 返回的 JSON 内容（容错处理）
 */
function parseAiJson(content) {
  if (!content) return null;
  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch (e) { /* ignore */ }

  // 尝试提取 JSON 块
  var jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e) { /* ignore */ }
  }

  // 尝试提取 { } 块
  var braceMatch = content.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch (e) { /* ignore */ }
  }

  return null;
}

// ─────────────────────────────────────────────────────────
// 增强版函数：本地优先 + 外部 AI 增强
// ─────────────────────────────────────────────────────────

/**
 * 增强版用户画像分析
 * 本地规则引擎生成基础分析，外部 AI 可选增强个性化建议
 */
async function analyzeProfileEnhanced(cloud, user) {
  // 始终先运行本地引擎
  var localResult = localAi.analyzeProfile(user);

  if (!getConfig(cloud).enabled) {
    return Object.assign({}, localResult, { _source: "local" });
  }

  try {
    var systemPrompt = [
      "你是一个阅读社交平台的 AI 助手。",
      "根据用户的阅读偏好数据，生成个性化的阅读画像分析和推荐建议。",
      "请用 JSON 格式返回，包含以下字段：",
      "  - enhancedSummary: 更生动的个性化描述（2-3句话）",
      "  - readingStyle: 阅读风格标签（如'深度沉浸型'、'快速浏览型'等）",
      "  - bookRecommendations: 基于偏好推荐的3本书名",
      "  - socialTips: 2条社交建议（如何找到合适的读书搭子）",
      "只返回 JSON，不要其他文字。",
    ].join("\n");

    var userPrompt = JSON.stringify({
      genres: user.genres || [],
      readingLevel: user.readingLevel || "",
      city: user.city || "",
      bio: user.bio || "",
      favoriteBooks: user.favoriteBooks || [],
      monthlyBookCount: user.monthlyBookCount || 0,
    });

    var result = await callExternalAi(cloud, systemPrompt, userPrompt, {
      temperature: 0.8,
      maxTokens: 800,
    });

    if (result.success) {
      var parsed = parseAiJson(result.content);
      if (parsed) {
        return Object.assign({}, localResult, {
          enhancedSummary: parsed.enhancedSummary || "",
          readingStyle: parsed.readingStyle || "",
          bookRecommendations: parsed.bookRecommendations || [],
          socialTips: parsed.socialTips || [],
          _source: "enhanced",
          _externalModel: result.model,
        });
      }
    }
  } catch (err) {
    console.warn("[ai-core] 外部 AI 画像增强失败，使用本地结果:", err.message);
  }

  return Object.assign({}, localResult, { _source: "local" });
}

/**
 * 增强版活动内容生成
 * 本地引擎生成基础结构，外部 AI 优化文案质量
 */
async function draftActivityEnhanced(cloud, form) {
  // 始终先运行本地引擎
  var localResult = localAi.draftActivity(form);

  if (!getConfig(cloud).enabled) {
    return Object.assign({}, localResult, { _source: "local" });
  }

  try {
    var genreLabel = "";
    var genres = form.genres || (form.genre ? [form.genre] : []);
    if (genres.length > 0) {
      var genreMap = {
        literature: "文学小说", philosophy: "哲学思想", history: "历史传记",
        science: "科学技术", business: "商业经管", psychology: "心理成长",
        art: "艺术设计", social: "社会科学", self_help: "自我提升",
        lifestyle: "生活美学", tech: "编程技术", education: "教育学习",
      };
      genreLabel = genres.map(function (g) { return genreMap[g] || g; }).join("、");
    }

    var systemPrompt = [
      "你是一个阅读社交平台的活动策划助手。",
      "根据用户提供的活动信息，生成吸引人的读书活动文案。",
      "请用 JSON 格式返回，包含以下字段：",
      "  - title: 有吸引力的活动标题（15-30字）",
      "  - description: 详细活动描述（200-400字，分段）",
      "  - discussionTopics: 5个有深度的讨论话题（数组）",
      "  - icebreaker: 一个破冰小游戏建议",
      "  - readingChallenge: 一个阅读小挑战",
      "语气要友好温暖，像一个热爱阅读的朋友在邀请你。",
      "只返回 JSON，不要其他文字。",
    ].join("\n");

    var userPrompt = JSON.stringify({
      bookName: form.bookName || "",
      genre: genreLabel || "综合阅读",
      format: form.format || "offline",
      bookMode: form.bookMode || "together",
      level: form.readingLevel || "casual",
      city: form.city || "",
      maxMembers: form.maxMembers || 6,
      customNote: form.customNote || "",
    });

    var result = await callExternalAi(cloud, systemPrompt, userPrompt, {
      temperature: 0.85,
      maxTokens: 1500,
    });

    if (result.success) {
      var parsed = parseAiJson(result.content);
      if (parsed && parsed.title) {
        return Object.assign({}, localResult, {
          enhancedTitle: parsed.title,
          enhancedDescription: parsed.description || "",
          enhancedTopics: parsed.discussionTopics || [],
          icebreaker: parsed.icebreaker || "",
          readingChallenge: parsed.readingChallenge || "",
          _source: "enhanced",
          _externalModel: result.model,
        });
      }
    }
  } catch (err) {
    console.warn("[ai-core] 外部 AI 活动生成失败，使用本地结果:", err.message);
  }

  return Object.assign({}, localResult, { _source: "local" });
}

/**
 * 增强版匹配解释
 * 本地引擎计算评分，外部 AI 生成更自然的解释文案
 */
async function explainMatchEnhanced(cloud, activity, user, scoreBreakdown) {
  var localResult = localAi.explainMatch(activity, user, scoreBreakdown);

  if (!getConfig(cloud).enabled) {
    return Object.assign({}, localResult, { _source: "local" });
  }

  try {
    var systemPrompt = [
      "你是一个阅读社交平台的匹配推荐助手。",
      "根据匹配分析数据，用温暖友好的语气为用户解释为什么推荐这个活动。",
      "请用 JSON 格式返回：",
      "  - naturalExplanation: 自然语言推荐解释（2-3句话，像朋友推荐一样）",
      "  - conversationStarters: 2个可以帮助用户开启对话的话题建议",
      "  - prepAdvice: 1条具体的参与准备建议",
      "只返回 JSON，不要其他文字。",
    ].join("\n");

    var userPrompt = JSON.stringify({
      activityTitle: activity.title || "",
      activityGenres: activity.genres || [],
      activityFormat: activity.format || "",
      matchLevel: localResult.matchLevel || "",
      strengths: localResult.strengths || [],
      risks: localResult.risks || [],
      userGenres: user.genres || [],
    });

    var result = await callExternalAi(cloud, systemPrompt, userPrompt, {
      temperature: 0.75,
      maxTokens: 600,
    });

    if (result.success) {
      var parsed = parseAiJson(result.content);
      if (parsed) {
        return Object.assign({}, localResult, {
          naturalExplanation: parsed.naturalExplanation || "",
          conversationStarters: parsed.conversationStarters || [],
          prepAdvice: parsed.prepAdvice || "",
          _source: "enhanced",
          _externalModel: result.model,
        });
      }
    }
  } catch (err) {
    console.warn("[ai-core] 外部 AI 匹配解释失败，使用本地结果:", err.message);
  }

  return Object.assign({}, localResult, { _source: "local" });
}

/**
 * 通用 AI 助手路由
 * 根据 action 类型分发到不同的处理逻辑
 */
async function aiAssist(cloud, action, params) {
  switch (action) {
    case "profile_analysis":
      return analyzeProfileEnhanced(cloud, params.user || params);

    case "activity_draft":
      return draftActivityEnhanced(cloud, params.form || params);

    case "match_explain":
      return explainMatchEnhanced(
        cloud,
        params.activity,
        params.user,
        params.scoreBreakdown
      );

    case "content_review":
      // 内容审核仅使用本地引擎（安全考量，不发送到外部）
      return localAi.moderateContent(params.text, params.fields);

    case "report_triage":
      return localAi.triageReport(params.report || params);

    case "review_hint":
      return localAi.reviewHint(params.applicant, params.activity);

    case "score_activity":
      return localAi.scoreActivity(params.activity, params.user);

    case "ai_workbench":
      return localAi.buildAiWorkbench(
        params.activities,
        params.user,
        params.stats
      );

    case "free_chat": {
      // 自由对话模式：调用外部 AI
      if (!getConfig(cloud).enabled) {
        return {
          success: false,
          message: "AI 对话功能暂未开放，请稍后再试。",
          _source: "local",
        };
      }
      var chatResult = await callExternalAi(
        cloud,
        "你是读书搭子平台的智能助手，擅长阅读推荐、读书方法、活动建议等话题。请用友好温暖的中文回答用户问题。",
        params.message || params.question || "",
        { temperature: 0.8, maxTokens: 1000 }
      );
      if (chatResult.success) {
        return {
          success: true,
          message: chatResult.content,
          _source: "external",
          _externalModel: chatResult.model,
        };
      }
      return {
        success: false,
        message: "抱歉，AI 助手暂时无法响应，请稍后再试。",
        _source: "fallback",
      };
    }

    default:
      return {
        success: false,
        message: "未知的 AI 操作：" + action,
      };
  }
}

// ─────────────────────────────────────────────────────────
// 导出：本地函数 + 增强函数
// ─────────────────────────────────────────────────────────

module.exports = {
  // 本地引擎（同步，无外部依赖）
  analyzeProfile: localAi.analyzeProfile,
  draftActivity: localAi.draftActivity,
  moderateContent: localAi.moderateContent,
  explainMatch: localAi.explainMatch,
  scoreActivity: localAi.scoreActivity,
  triageReport: localAi.triageReport,
  reviewHint: localAi.reviewHint,
  buildAiWorkbench: localAi.buildAiWorkbench,

  // 增强版（异步，可选外部 AI）
  analyzeProfileEnhanced: analyzeProfileEnhanced,
  draftActivityEnhanced: draftActivityEnhanced,
  explainMatchEnhanced: explainMatchEnhanced,

  // 通用路由
  aiAssist: aiAssist,

  // 工具函数
  callExternalAi: callExternalAi,
  getConfig: getConfig,
  parseAiJson: parseAiJson,
};
