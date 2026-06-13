/**
 * 读书搭子小程序 - 云函数服务层
 *
 * 所有业务逻辑集中于此，通过 createApi() 工厂创建实例后，
 * 由 handle(action, data, userInfo) 统一路由。
 *
 * 集合列表：
 *   users              - 用户表
 *   activities         - 活动表
 *   applications       - 活动申请表
 *   match_intents      - 匹配意向表
 *   recommendation_feedback - 推荐反馈表
 *   activity_shares    - 活动分享记录
 *   user_blocks        - 用户屏蔽记录
 *   match_reviews      - 匹配评价表
 *   reports            - 举报表
 */

"use strict";

var aiCore = require("./ai-core");
var display = require("./display");

// ─────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────

function _now() { return new Date(); }

function _nowMs() { return Date.now(); }

function _genId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

function _ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

function _pick(obj, keys) {
  var result = {};
  keys.forEach(function (k) {
    if (obj[k] !== undefined) result[k] = obj[k];
  });
  return result;
}

function _omit(obj, keys) {
  var result = {};
  var omitSet = {};
  keys.forEach(function (k) { omitSet[k] = true; });
  Object.keys(obj).forEach(function (k) {
    if (!omitSet[k]) result[k] = obj[k];
  });
  return result;
}

/**
 * 安全地获取嵌套属性
 */
function _safeGet(obj, path, def) {
  if (!obj || !path) return def;
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return def;
    cur = cur[parts[i]];
  }
  return cur !== undefined ? cur : def;
}

/**
 * 过滤掉用户敏感字段
 */
function _sanitizeUser(user) {
  if (!user) return null;
  return _omit(user, [
    "_openid", "openid", "sessionKey", "phone",
    "idCard", "realName",
  ]);
}

/**
 * 检查字符串是否包含违规内容（本地快速检测）
 */
function _quickContentCheck(text) {
  if (!text) return { ok: true };
  var moderation = aiCore.moderateContent(text);
  if (moderation.verdict === "blocked") {
    return {
      ok: false,
      reason: "内容包含违规信息",
      risks: moderation.risks,
    };
  }
  return { ok: true, moderation: moderation };
}

/**
 * 调用微信内容安全检测（msgSecCheck）
 */
async function _wxContentCheck(cloud, text) {
  if (!text || !cloud || !cloud.openapi) {
    return { ok: true, skipped: true };
  }
  try {
    var result = await cloud.openapi.security.msgSecCheck({
      content: text,
    });
    if (result && result.result && result.result.suggest === "pass") {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "内容未通过微信安全检测",
      detail: result && result.result,
    };
  } catch (err) {
    // 安全检测接口调用失败时降级为本地检测
    console.warn("[service] msgSecCheck 调用失败，降级为本地检测:", err.message);
    return _quickContentCheck(text);
  }
}

// ─────────────────────────────────────────────────────────
// API 工厂
// ─────────────────────────────────────────────────────────

function createApi(opts) {
  var db = opts.db;
  var cloud = opts.cloud;
  var _ = db.command;

  // 集合引用
  var usersCol = db.collection("users");
  var activitiesCol = db.collection("activities");
  var applicationsCol = db.collection("applications");
  var intentsCol = db.collection("match_intents");
  var feedbackCol = db.collection("recommendation_feedback");
  var sharesCol = db.collection("activity_shares");
  var blocksCol = db.collection("user_blocks");
  var reviewsCol = db.collection("match_reviews");
  var reportsCol = db.collection("reports");

  // ─────────────────────────────────────────────────────
  // 用户相关
  // ─────────────────────────────────────────────────────

  /**
   * 登录 / 注册
   */
  async function _login(openid) {
    if (!openid) throw new Error("缺少用户身份");

    var existing = await usersCol.where({ _openid: openid }).limit(1).get();

    if (existing.data && existing.data.length > 0) {
      var user = existing.data[0];
      // 更新最后登录时间
      await usersCol.doc(user._id).update({
        data: { lastLoginAt: _now(), loginCount: _.inc(1) },
      });
      return Object.assign({}, _sanitizeUser(user), { isNew: false });
    }

    // 新用户
    var newUser = {
      _openid: openid,
      nickname: "",
      avatarUrl: "",
      bio: "",
      genres: [],
      readingLevel: "",
      city: "",
      availableSlots: [],
      preferredFormats: [],
      bookMode: "",
      favoriteBooks: [],
      favoriteAuthors: [],
      monthlyBookCount: 0,
      activityCount: 0,
      createdCount: 0,
      attendedCount: 0,
      noShowCount: 0,
      goodRate: 0,
      reviewCount: 0,
      reportCount: 0,
      trustScore: 50,
      level: "newbie",
      createdAt: _now(),
      updatedAt: _now(),
      lastLoginAt: _now(),
      loginCount: 1,
      status: "active",
    };

    var addResult = await usersCol.add({ data: newUser });
    newUser._id = addResult._id;

    return Object.assign({}, _sanitizeUser(newUser), { isNew: true });
  }

  /**
   * 获取当前用户信息
   */
  async function _me(openid) {
    if (!openid) throw new Error("缺少用户身份");
    var result = await usersCol.where({ _openid: openid }).limit(1).get();
    if (!result.data || result.data.length === 0) {
      throw new Error("用户不存在，请先登录");
    }
    return _sanitizeUser(result.data[0]);
  }

  /**
   * 获取仪表盘数据
   */
  async function _getDashboard(openid, data) {
    var user = await _me(openid);

    // 我创建的活动
    var myCreated = await activitiesCol
      .where({ _openid: openid, status: _.neq("deleted") })
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    // 我参加的活动
    var myApps = await applicationsCol
      .where({
        _openid: openid,
        status: _.in(["accepted", "attended"]),
      })
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    var joinedActivityIds = (myApps.data || []).map(function (a) { return a.activityId; });
    var joinedActivities = [];
    if (joinedActivityIds.length > 0) {
      var batch = await activitiesCol
        .where({ _id: _.in(joinedActivityIds) })
        .limit(5)
        .get();
      joinedActivities = batch.data || [];
    }

    // 待审核申请（我发起的活动收到的申请）
    var pendingApps = [];
    var createdIds = (myCreated.data || []).map(function (a) { return a._id; });
    if (createdIds.length > 0) {
      var pendResult = await applicationsCol
        .where({
          activityId: _.in(createdIds),
          status: "pending",
        })
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
      pendingApps = pendResult.data || [];
    }

    // 推荐活动（简易逻辑：按用户偏好匹配）
    var recommendations = await _getRecommendations(openid, { limit: 5 });

    return {
      user: user,
      myCreated: myCreated.data || [],
      joinedActivities: joinedActivities,
      pendingApplications: pendingApps,
      recommendations: recommendations,
      stats: {
        createdCount: user.createdCount || 0,
        attendedCount: user.attendedCount || 0,
        pendingReview: pendingApps.length,
        unreadRecommendations: recommendations.length,
      },
    };
  }

  /**
   * 更新用户资料
   */
  async function _updateProfile(openid, data) {
    if (!openid) throw new Error("缺少用户身份");

    var allowed = [
      "nickname", "avatarUrl", "bio", "genres", "readingLevel",
      "city", "availableSlots", "preferredFormats", "bookMode",
      "favoriteBooks", "favoriteAuthors", "monthlyBookCount",
    ];

    var updates = _pick(data, allowed);
    if (Object.keys(updates).length === 0) {
      throw new Error("没有可更新的字段");
    }

    // 内容安全检测（对文本字段进行检测）
    var textFields = ["nickname", "bio"];
    for (var i = 0; i < textFields.length; i++) {
      var field = textFields[i];
      if (updates[field]) {
        var wxCheck = await _wxContentCheck(cloud, updates[field]);
        if (!wxCheck.ok) {
          throw new Error(wxCheck.reason || "内容未通过安全检测");
        }
      }
    }

    updates.updatedAt = _now();

    // 计算新的资料完整度
    var existingUser = await _me(openid);
    var mergedUser = Object.assign({}, existingUser, updates);
    var profileAnalysis = aiCore.analyzeProfile(mergedUser);
    updates.profileCompleteness = profileAnalysis.completenessScore;
    updates.profileGrade = profileAnalysis.profileGrade;

    await usersCol.where({ _openid: openid }).update({ data: updates });

    return {
      updated: true,
      fields: Object.keys(updates),
      profileAnalysis: {
        completenessScore: profileAnalysis.completenessScore,
        profileGrade: profileAnalysis.profileGrade,
        gaps: profileAnalysis.gaps,
        nextActions: profileAnalysis.nextActions,
      },
    };
  }

  // ─────────────────────────────────────────────────────
  // 活动相关
  // ─────────────────────────────────────────────────────

  /**
   * 创建活动
   */
  async function _createActivity(openid, data) {
    if (!openid) throw new Error("缺少用户身份");

    // 必填字段校验
    if (!data.title || data.title.length < 3) {
      throw new Error("活动标题至少 3 个字符");
    }
    if (!data.genres || _ensureArray(data.genres).length === 0) {
      throw new Error("请选择至少一个阅读类型");
    }

    // 内容安全检测
    var fullText = (data.title || "") + " " + (data.description || "") + " " + (data.location || "");
    var wxCheck = await _wxContentCheck(cloud, fullText);
    if (!wxCheck.ok) {
      throw new Error(wxCheck.reason || "活动内容未通过安全检测");
    }

    // 本地内容审核
    var localModeration = aiCore.moderateContent(data.description || "", {
      title: data.title,
      location: data.location,
    });

    var activity = {
      _openid: openid,
      title: data.title,
      description: data.description || "",
      bookName: data.bookName || "",
      genres: _ensureArray(data.genres),
      readingLevel: data.readingLevel || "casual",
      format: data.format || "offline",
      bookMode: data.bookMode || "together",
      city: data.city || "",
      district: data.district || "",
      location: data.location || "",
      address: data.address || "",
      longitude: data.longitude || 0,
      latitude: data.latitude || 0,
      timeSlot: data.timeSlot || "",
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      startAt: data.startAt || null,
      endAt: data.endAt || null,
      maxMembers: data.maxMembers || 6,
      currentMembers: 0,
      memberIds: [],
      tags: data.tags || [],
      coverImage: data.coverImage || "",
      creatorProfile: null, // 会在下面填充
      status: localModeration.verdict === "blocked" ? "pending_review" : "open",
      moderationStatus: localModeration.verdict === "auto_passed" ? "passed" : "pending",
      moderationScore: localModeration.score,
      viewCount: 0,
      shareCount: 0,
      applicationCount: 0,
      aiScore: null,
      createdAt: _now(),
      updatedAt: _now(),
    };

    // 获取发起人资料快照
    try {
      var creator = await _me(openid);
      activity.creatorProfile = _pick(creator, [
        "nickname", "avatarUrl", "bio", "genres", "readingLevel",
        "city", "activityCount", "goodRate", "trustScore",
      ]);
    } catch (e) {
      // 忽略获取失败
    }

    var addResult = await activitiesCol.add({ data: activity });
    activity._id = addResult._id;

    // 更新用户创建数
    await usersCol.where({ _openid: openid }).update({
      data: {
        createdCount: _.inc(1),
        activityCount: _.inc(1),
        updatedAt: _now(),
      },
    });

    return activity;
  }

  /**
   * 取消活动
   */
  async function _cancelActivity(openid, data) {
    if (!data.activityId) throw new Error("缺少活动 ID");

    var actResult = await activitiesCol.doc(data.activityId).get();
    var activity = actResult.data;
    if (!activity) throw new Error("活动不存在");
    if (activity._openid !== openid) throw new Error("只有活动发起人可以取消");
    if (activity.status === "cancelled") throw new Error("活动已取消");
    if (activity.status === "completed") throw new Error("已完成的活动不能取消");

    await activitiesCol.doc(data.activityId).update({
      data: { status: "cancelled", updatedAt: _now(), cancelReason: data.reason || "" },
    });

    // 通知已接受的申请者
    var acceptedApps = await applicationsCol
      .where({ activityId: data.activityId, status: "accepted" })
      .get();

    if (acceptedApps.data && acceptedApps.data.length > 0) {
      // 批量更新申请状态
      for (var i = 0; i < acceptedApps.data.length; i++) {
        await applicationsCol.doc(acceptedApps.data[i]._id).update({
          data: { status: "withdrawn", cancelNote: "活动已被发起人取消", updatedAt: _now() },
        });
      }
    }

    return { cancelled: true, notifiedCount: (acceptedApps.data || []).length };
  }

  /**
   * 申请参加活动
   */
  async function _applyActivity(openid, data) {
    if (!openid) throw new Error("缺少用户身份");
    if (!data.activityId) throw new Error("缺少活动 ID");

    // 检查活动存在且可参加
    var actResult = await activitiesCol.doc(data.activityId).get();
    var activity = actResult.data;
    if (!activity) throw new Error("活动不存在");
    if (activity.status !== "open") throw new Error("活动当前状态不允许申请");
    if (activity.currentMembers >= activity.maxMembers) throw new Error("活动已满员");
    if (activity._openid === openid) throw new Error("不能申请自己发起的活动");

    // 检查是否已申请
    var existing = await applicationsCol
      .where({ activityId: data.activityId, _openid: openid })
      .limit(1)
      .get();
    if (existing.data && existing.data.length > 0) {
      var existApp = existing.data[0];
      if (existApp.status === "withdrawn") {
        // 可以重新申请
        await applicationsCol.doc(existApp._id).update({
          data: {
            status: "pending",
            message: data.message || "",
            updatedAt: _now(),
          },
        });
        return { applied: true, reApplied: true, applicationId: existApp._id };
      }
      throw new Error("你已经申请过该活动");
    }

    // 内容检测（申请留言）
    if (data.message) {
      var check = _quickContentCheck(data.message);
      if (!check.ok) throw new Error("申请留言包含不当内容");
    }

    // 检查是否被发起人屏蔽
    var block = await blocksCol
      .where({ blockerOpenid: activity._openid, blockedOpenid: openid })
      .limit(1)
      .get();
    if (block.data && block.data.length > 0) {
      throw new Error("你无法申请该活动");
    }

    // 创建申请
    var applicant = await _me(openid);
    var application = {
      activityId: data.activityId,
      activityTitle: activity.title,
      _openid: openid,
      applicantProfile: _pick(applicant, [
        "nickname", "avatarUrl", "bio", "genres", "readingLevel",
        "city", "activityCount", "attendedCount", "goodRate",
      ]),
      message: data.message || "",
      status: "pending",
      reviewNote: "",
      aiHint: null,
      createdAt: _now(),
      updatedAt: _now(),
    };

    // AI 审核建议
    application.aiHint = aiCore.reviewHint(applicant, activity);

    var addResult = await applicationsCol.add({ data: application });
    application._id = addResult._id;

    // 更新活动申请数
    await activitiesCol.doc(data.activityId).update({
      data: { applicationCount: _.inc(1), updatedAt: _now() },
    });

    return {
      applied: true,
      applicationId: addResult._id,
      aiHint: application.aiHint,
    };
  }

  /**
   * 撤回申请
   */
  async function _withdrawApplication(openid, data) {
    if (!data.applicationId) throw new Error("缺少申请 ID");

    var appResult = await applicationsCol.doc(data.applicationId).get();
    var application = appResult.data;
    if (!application) throw new Error("申请不存在");
    if (application._openid !== openid) throw new Error("只能撤回自己的申请");
    if (["withdrawn", "rejected"].indexOf(application.status) >= 0) {
      throw new Error("当前状态不允许撤回");
    }

    await applicationsCol.doc(data.applicationId).update({
      data: { status: "withdrawn", updatedAt: _now() },
    });

    // 如果之前是通过状态，减少活动参与人数
    if (application.status === "accepted") {
      await activitiesCol.doc(application.activityId).update({
        data: {
          currentMembers: _.inc(-1),
          memberIds: _.pull(openid),
          updatedAt: _now(),
        },
      });
    }

    return { withdrawn: true };
  }

  /**
   * 确认到场
   */
  async function _confirmAttendance(openid, data) {
    if (!data.activityId) throw new Error("缺少活动 ID");

    var actResult = await activitiesCol.doc(data.activityId).get();
    var activity = actResult.data;
    if (!activity) throw new Error("活动不存在");

    // 只有发起人或已接受的参与者可以确认
    var isCreator = activity._openid === openid;

    if (isCreator) {
      // 发起人批量确认：将 accepted 变为 attended
      var acceptedApps = await applicationsCol
        .where({ activityId: data.activityId, status: "accepted" })
        .get();

      var attendedCount = 0;
      var noShowUserIds = [];

      if (acceptedApps.data) {
        var confirmIds = _ensureArray(data.confirmedOpenids);
        for (var i = 0; i < acceptedApps.data.length; i++) {
          var app = acceptedApps.data[i];
          if (confirmIds.length === 0 || confirmIds.indexOf(app._openid) >= 0) {
            await applicationsCol.doc(app._id).update({
              data: { status: "attended", updatedAt: _now() },
            });
            // 更新参与者统计
            await usersCol.where({ _openid: app._openid }).update({
              data: { attendedCount: _.inc(1), updatedAt: _now() },
            });
            attendedCount++;
          } else {
            // 未到场
            await applicationsCol.doc(app._id).update({
              data: { status: "no_show", updatedAt: _now() },
            });
            await usersCol.where({ _openid: app._openid }).update({
              data: { noShowCount: _.inc(1), updatedAt: _now() },
            });
            noShowUserIds.push(app._openid);
          }
        }
      }

      // 更新活动状态
      await activitiesCol.doc(data.activityId).update({
        data: {
          status: "completed",
          currentMembers: attendedCount,
          completedAt: _now(),
          updatedAt: _now(),
        },
      });

      return {
        confirmed: true,
        attendedCount: attendedCount,
        noShowCount: noShowUserIds.length,
      };
    }

    // 参与者自我确认
    var myApp = await applicationsCol
      .where({ activityId: data.activityId, _openid: openid, status: "accepted" })
      .limit(1)
      .get();

    if (!myApp.data || myApp.data.length === 0) {
      throw new Error("你没有该活动的已接受申请");
    }

    await applicationsCol.doc(myApp.data[0]._id).update({
      data: { selfConfirmed: true, selfConfirmAt: _now(), updatedAt: _now() },
    });

    return { confirmed: true, selfConfirm: true };
  }

  // ─────────────────────────────────────────────────────
  // 推荐相关
  // ─────────────────────────────────────────────────────

  /**
   * 获取推荐活动
   */
  async function _getRecommendations(openid, data) {
    var limit = data.limit || 10;
    var page = data.page || 1;
    var skip = (page - 1) * limit;

    // 获取用户信息
    var user = null;
    try {
      user = await _me(openid);
    } catch (e) { /* 未登录也给推荐 */ }

    // 获取用户屏蔽的发起人
    var blockedCreators = [];
    if (openid) {
      var blocks = await blocksCol.where({ blockerOpenid: openid }).get();
      blockedCreators = (blocks.data || []).map(function (b) { return b.blockedOpenid; });
    }

    // 构建查询条件
    var conditions = {
      status: _.in(["open", "full"]),
    };
    if (blockedCreators.length > 0) {
      conditions._openid = _.nin(blockedCreators);
    }
    if (openid) {
      // 排除自己发起的活动
      conditions._openid = _.neq(openid);
    }

    // 如果有类型偏好，优先查询匹配的
    if (user && user.genres && user.genres.length > 0) {
      conditions.genres = _.elemMatch(_.in(user.genres));
    }

    var query = activitiesCol.where(conditions);

    // 城市筛选
    if (data.city) {
      query = activitiesCol.where(Object.assign({}, conditions, {
        city: _.in([data.city, "online"]),
      }));
    }

    var result = await query
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    var activities = result.data || [];

    // 为每个活动计算 AI 评分
    var scored = activities.map(function (act) {
      var scoreResult = aiCore.scoreActivity(act, user);
      return Object.assign({}, act, {
        aiScore: scoreResult.totalScore,
        aiGrade: scoreResult.grade,
        aiDimensions: scoreResult.dimensions,
      });
    });

    // 按 AI 评分排序
    scored.sort(function (a, b) { return b.aiScore - a.aiScore; });

    return scored;
  }

  /**
   * 获取活动详情
   */
  async function _getActivityDetail(openid, data) {
    if (!data.activityId) throw new Error("缺少活动 ID");

    var actResult = await activitiesCol.doc(data.activityId).get();
    var activity = actResult.data;
    if (!activity) throw new Error("活动不存在");

    // 增加浏览量
    await activitiesCol.doc(data.activityId).update({
      data: { viewCount: _.inc(1) },
    });

    // 获取申请列表
    var applications = [];
    var myApplication = null;
    var isCreator = activity._openid === openid;

    if (isCreator) {
      var appsResult = await applicationsCol
        .where({ activityId: data.activityId })
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      applications = appsResult.data || [];
    } else if (openid) {
      var myAppResult = await applicationsCol
        .where({ activityId: data.activityId, _openid: openid })
        .limit(1)
        .get();
      if (myAppResult.data && myAppResult.data.length > 0) {
        myApplication = myAppResult.data[0];
      }
    }

    // AI 评分
    var user = null;
    try {
      user = await _me(openid);
    } catch (e) { /* ignore */ }

    var scoreResult = aiCore.scoreActivity(activity, user);
    var matchExplanation = aiCore.explainMatch(activity, user, {
      totalScore: scoreResult.totalScore,
      matchScore: scoreResult.dimensions.matchScore.score,
      safetyScore: scoreResult.dimensions.safetyScore.score,
      reliabilityScore: scoreResult.dimensions.reliabilityScore.score,
    });

    return {
      activity: Object.assign({}, activity, {
        aiScore: scoreResult.totalScore,
        aiGrade: scoreResult.grade,
        aiDimensions: scoreResult.dimensions,
      }),
      applications: applications,
      myApplication: myApplication,
      isCreator: isCreator,
      matchExplanation: matchExplanation,
    };
  }

  /**
   * 审核申请
   */
  async function _reviewApplication(openid, data) {
    if (!data.applicationId) throw new Error("缺少申请 ID");
    if (!data.decision) throw new Error("缺少审核决定（accept/reject）");

    var appResult = await applicationsCol.doc(data.applicationId).get();
    var application = appResult.data;
    if (!application) throw new Error("申请不存在");

    // 确认是活动发起人
    var actResult = await activitiesCol.doc(application.activityId).get();
    var activity = actResult.data;
    if (!activity || activity._openid !== openid) {
      throw new Error("只有活动发起人可以审核申请");
    }

    if (application.status !== "pending") {
      throw new Error("该申请已被处理");
    }

    var newStatus = data.decision === "accept" ? "accepted" : "rejected";

    await applicationsCol.doc(data.applicationId).update({
      data: {
        status: newStatus,
        reviewNote: data.note || "",
        reviewedAt: _now(),
        updatedAt: _now(),
      },
    });

    // 如果是通过，增加活动参与人数
    if (newStatus === "accepted") {
      await activitiesCol.doc(application.activityId).update({
        data: {
          currentMembers: _.inc(1),
          memberIds: _.push(application._openid),
          updatedAt: _now(),
        },
      });

      // 检查是否满员
      var updatedAct = await activitiesCol.doc(application.activityId).get();
      if (updatedAct.data.currentMembers >= updatedAct.data.maxMembers) {
        await activitiesCol.doc(application.activityId).update({
          data: { status: "full", updatedAt: _now() },
        });
      }
    }

    return {
      reviewed: true,
      applicationId: data.applicationId,
      newStatus: newStatus,
    };
  }

  // ─────────────────────────────────────────────────────
  // 反馈 & 互动
  // ─────────────────────────────────────────────────────

  /**
   * 记录推荐反馈
   */
  async function _recordRecommendationFeedback(openid, data) {
    if (!data.activityId) throw new Error("缺少活动 ID");

    var feedback = {
      _openid: openid,
      activityId: data.activityId,
      action: data.action || "view", // view | like | apply | skip | dislike
      aiScore: data.aiScore || 0,
      aiGrade: data.aiGrade || "",
      context: data.context || {},
      createdAt: _now(),
    };

    var result = await feedbackCol.add({ data: feedback });
    return { recorded: true, feedbackId: result._id };
  }

  /**
   * 记录活动分享
   */
  async function _recordActivityShare(openid, data) {
    if (!data.activityId) throw new Error("缺少活动 ID");

    var share = {
      _openid: openid,
      activityId: data.activityId,
      platform: data.platform || "wechat", // wechat | moments | link | qrcode
      createdAt: _now(),
    };

    await sharesCol.add({ data: share });

    // 增加活动分享数
    await activitiesCol.doc(data.activityId).update({
      data: { shareCount: _.inc(1), updatedAt: _now() },
    });

    return { recorded: true };
  }

  /**
   * 屏蔽活动发起人
   */
  async function _blockActivityCreator(openid, data) {
    if (!data.activityId && !data.targetOpenid) {
      throw new Error("缺少活动 ID 或目标用户");
    }

    var targetOpenid = data.targetOpenid;
    if (!targetOpenid && data.activityId) {
      var act = await activitiesCol.doc(data.activityId).get();
      if (act.data) targetOpenid = act.data._openid;
    }

    if (!targetOpenid) throw new Error("无法确定屏蔽目标");
    if (targetOpenid === openid) throw new Error("不能屏蔽自己");

    // 检查是否已屏蔽
    var existing = await blocksCol
      .where({ blockerOpenid: openid, blockedOpenid: targetOpenid })
      .limit(1)
      .get();
    if (existing.data && existing.data.length > 0) {
      return { blocked: true, alreadyBlocked: true };
    }

    await blocksCol.add({
      data: {
        blockerOpenid: openid,
        blockedOpenid: targetOpenid,
        reason: data.reason || "",
        createdAt: _now(),
      },
    });

    return { blocked: true };
  }

  // ─────────────────────────────────────────────────────
  // 评价系统
  // ─────────────────────────────────────────────────────

  /**
   * 提交匹配评价
   */
  async function _submitMatchReview(openid, data) {
    if (!data.activityId) throw new Error("缺少活动 ID");
    if (!data.targetOpenid) throw new Error("缺少评价对象");
    if (!data.rating || data.rating < 1 || data.rating > 5) {
      throw new Error("评分范围为 1-5");
    }

    // 检查是否有资格评价（需参加过同一活动）
    var myAttendance = await applicationsCol
      .where({
        activityId: data.activityId,
        _openid: openid,
        status: _.in(["attended", "accepted"]),
      })
      .limit(1)
      .get();
    if (!myAttendance.data || myAttendance.data.length === 0) {
      throw new Error("你未参加该活动，无法评价");
    }

    // 检查是否已评价
    var existing = await reviewsCol
      .where({
        activityId: data.activityId,
        reviewerOpenid: openid,
        targetOpenid: data.targetOpenid,
      })
      .limit(1)
      .get();
    if (existing.data && existing.data.length > 0) {
      throw new Error("你已经评价过该用户");
    }

    // 内容检测
    if (data.content) {
      var check = _quickContentCheck(data.content);
      if (!check.ok) throw new Error("评价内容包含不当信息");
    }

    var review = {
      activityId: data.activityId,
      reviewerOpenid: openid,
      targetOpenid: data.targetOpenid,
      rating: data.rating,
      content: data.content || "",
      tags: _ensureArray(data.tags),
      createdAt: _now(),
    };

    var addResult = await reviewsCol.add({ data: review });

    // 更新目标用户的好评数据
    await usersCol.where({ _openid: data.targetOpenid }).update({
      data: {
        reviewCount: _.inc(1),
        updatedAt: _now(),
      },
    });

    return { submitted: true, reviewId: addResult._id };
  }

  /**
   * 获取匹配评价档案
   */
  async function _getMatchRatingProfile(openid, data) {
    var targetOpenid = data.targetOpenid || openid;

    var reviews = await reviewsCol
      .where({ targetOpenid: targetOpenid })
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    var reviewList = reviews.data || [];
    var totalRating = 0;
    var tagCount = {};

    reviewList.forEach(function (r) {
      totalRating += r.rating || 0;
      _ensureArray(r.tags).forEach(function (t) {
        tagCount[t] = (tagCount[t] || 0) + 1;
      });
    });

    var avgRating = reviewList.length > 0
      ? Math.round((totalRating / reviewList.length) * 10) / 10
      : 0;

    // 排序标签
    var topTags = Object.keys(tagCount)
      .map(function (t) { return { tag: t, count: tagCount[t] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 10);

    return {
      targetOpenid: targetOpenid,
      reviewCount: reviewList.length,
      avgRating: avgRating,
      topTags: topTags,
      recentReviews: reviewList.slice(0, 10).map(function (r) {
        return _omit(r, ["targetOpenid"]);
      }),
    };
  }

  /**
   * 获取可靠度档案
   */
  async function _getReliabilityProfile(openid, data) {
    var targetOpenid = data.targetOpenid || openid;

    var userResult = await usersCol.where({ _openid: targetOpenid }).limit(1).get();
    if (!userResult.data || userResult.data.length === 0) {
      throw new Error("用户不存在");
    }
    var user = userResult.data[0];

    // 计算可靠度
    var trustScore = user.trustScore || 50;
    var attended = user.attendedCount || 0;
    var noShow = user.noShowCount || 0;
    var reports = user.reportCount || 0;
    var reviewCount = user.reviewCount || 0;
    var goodRate = user.goodRate || 0;

    // 可靠度等级
    var reliabilityGrade;
    if (trustScore >= 80) reliabilityGrade = "excellent";
    else if (trustScore >= 60) reliabilityGrade = "good";
    else if (trustScore >= 40) reliabilityGrade = "fair";
    else reliabilityGrade = "poor";

    return {
      targetOpenid: targetOpenid,
      trustScore: trustScore,
      reliabilityGrade: reliabilityGrade,
      stats: {
        attendedCount: attended,
        noShowCount: noShow,
        noShowRate: attended > 0 ? Math.round((noShow / attended) * 100) : 0,
        reportCount: reports,
        reviewCount: reviewCount,
        goodRate: Math.round(goodRate * 100),
      },
      badges: _calcBadges(user),
      joinedAt: user.createdAt,
    };
  }

  /**
   * 计算用户徽章
   */
  function _calcBadges(user) {
    var badges = [];
    var attended = user.attendedCount || 0;
    var created = user.createdCount || 0;

    if (attended >= 1) badges.push({ key: "first_join", label: "初次参与", icon: "🌟" });
    if (attended >= 5) badges.push({ key: "active_reader", label: "活跃读者", icon: "📚" });
    if (attended >= 20) badges.push({ key: "reading_master", label: "阅读达人", icon: "🏆" });
    if (created >= 1) badges.push({ key: "first_host", label: "首次发起", icon: "🎤" });
    if (created >= 5) badges.push({ key: "community_builder", label: "社区建设者", icon: "🏗️" });
    if ((user.reviewCount || 0) >= 5) badges.push({ key: "reviewer", label: "热心评价", icon: "💬" });
    if ((user.goodRate || 0) >= 0.9 && attended >= 5) badges.push({ key: "trusted", label: "值得信赖", icon: "✅" });

    return badges;
  }

  /**
   * 获取 AI 画像
   */
  async function _getAiProfile(openid, data) {
    var targetOpenid = data.targetOpenid || openid;

    var userResult = await usersCol.where({ _openid: targetOpenid }).limit(1).get();
    if (!userResult.data || userResult.data.length === 0) {
      throw new Error("用户不存在");
    }

    var user = userResult.data[0];
    var profileAnalysis = aiCore.analyzeProfile(user);

    return {
      targetOpenid: targetOpenid,
      analysis: profileAnalysis,
      generatedAt: _nowMs(),
    };
  }

  // ─────────────────────────────────────────────────────
  // 匹配意向
  // ─────────────────────────────────────────────────────

  /**
   * 创建匹配意向
   */
  async function _createMatchIntent(openid, data) {
    if (!data.type) throw new Error("缺少意向类型");

    var intent = {
      _openid: openid,
      type: data.type, // seeking_partner | seeking_activity | open_chat
      genres: _ensureArray(data.genres),
      readingLevel: data.readingLevel || "",
      format: data.format || "",
      city: data.city || "",
      timeSlot: data.timeSlot || "",
      description: data.description || "",
      status: "active",
      matchCount: 0,
      expiresAt: data.expiresAt || null,
      createdAt: _now(),
      updatedAt: _now(),
    };

    // 内容检测
    if (data.description) {
      var check = _quickContentCheck(data.description);
      if (!check.ok) throw new Error("意向描述包含不当内容");
    }

    var result = await intentsCol.add({ data: intent });
    intent._id = result._id;

    return intent;
  }

  /**
   * 获取意向池列表
   */
  async function _listIntentPools(openid, data) {
    var limit = data.limit || 20;
    var conditions = { status: "active" };

    if (data.type) conditions.type = data.type;
    if (data.city) conditions.city = _.in([data.city, ""]);
    if (data.genre) conditions.genres = _.elemMatch(_.eq(data.genre));

    // 排除自己
    conditions._openid = _.neq(openid);

    var result = await intentsCol
      .where(conditions)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return result.data || [];
  }

  // ─────────────────────────────────────────────────────
  // 运营管理
  // ─────────────────────────────────────────────────────

  /**
   * 获取运营审核队列
   */
  async function _getOpsQueue(openid, data) {
    var limit = data.limit || 20;

    // 待审核活动
    var pendingActivities = await activitiesCol
      .where({ moderationStatus: "pending" })
      .orderBy("createdAt", "asc")
      .limit(limit)
      .get();

    // 待处理举报
    var pendingReports = await reportsCol
      .where({ status: _.in(["pending", "investigating"]) })
      .orderBy("createdAt", "asc")
      .limit(limit)
      .get();

    return {
      pendingActivities: pendingActivities.data || [],
      pendingReports: pendingReports.data || [],
      totalPending: (pendingActivities.data || []).length + (pendingReports.data || []).length,
    };
  }

  /**
   * 获取运营漏斗数据
   */
  async function _getOpsFunnel(openid, data) {
    var days = data.days || 7;
    var since = new Date(_nowMs() - days * 86400000);

    // 统计各阶段数据
    var totalUsers = await usersCol.where({ createdAt: _.gte(since) }).count();
    var totalActivities = await activitiesCol.where({ createdAt: _.gte(since) }).count();
    var totalApplications = await applicationsCol.where({ createdAt: _.gte(since) }).count();
    var acceptedApps = await applicationsCol
      .where({ createdAt: _.gte(since), status: _.in(["accepted", "attended"]) })
      .count();
    var completedActs = await activitiesCol
      .where({ createdAt: _.gte(since), status: "completed" })
      .count();

    return {
      period: days + "天",
      since: since,
      funnel: {
        newUsers: totalUsers.total,
        newActivities: totalActivities.total,
        applications: totalApplications.total,
        accepted: acceptedApps.total,
        completed: completedActs.total,
      },
      conversionRates: {
        activityToApplication: totalActivities.total > 0
          ? Math.round((totalApplications.total / totalActivities.total) * 100) + "%"
          : "N/A",
        applicationToAccepted: totalApplications.total > 0
          ? Math.round((acceptedApps.total / totalApplications.total) * 100) + "%"
          : "N/A",
        activityToCompleted: totalActivities.total > 0
          ? Math.round((completedActs.total / totalActivities.total) * 100) + "%"
          : "N/A",
      },
    };
  }

  /**
   * 获取城市运营概览
   */
  async function _getCityOpsSummary(openid, data) {
    // 按城市聚合活动数和用户数
    var cities = display.CITY_OPTIONS.map(function (c) { return c.value; });
    var summary = [];

    for (var i = 0; i < cities.length; i++) {
      var city = cities[i];
      var actCount = await activitiesCol.where({ city: city, status: _.neq("deleted") }).count();
      var userCount = await usersCol.where({ city: city }).count();

      if (actCount.total > 0 || userCount.total > 0) {
        var openActs = await activitiesCol.where({ city: city, status: "open" }).count();
        summary.push({
          city: city,
          cityLabel: display.cityLabel(city),
          totalActivities: actCount.total,
          openActivities: openActs.total,
          totalUsers: userCount.total,
        });
      }
    }

    // 按活动数排序
    summary.sort(function (a, b) { return b.totalActivities - a.totalActivities; });

    return summary;
  }

  // ─────────────────────────────────────────────────────
  // 我的数据
  // ─────────────────────────────────────────────────────

  /**
   * 获取我的申请列表
   */
  async function _getMyApplications(openid, data) {
    var limit = data.limit || 20;
    var page = data.page || 1;
    var skip = (page - 1) * limit;
    var conditions = { _openid: openid };

    if (data.status) conditions.status = data.status;

    var result = await applicationsCol
      .where(conditions)
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    // 附带活动信息
    var apps = result.data || [];
    var enriched = [];

    for (var i = 0; i < apps.length; i++) {
      var app = apps[i];
      var actInfo = null;
      try {
        var actResult = await activitiesCol.doc(app.activityId).get();
        actInfo = _pick(actResult.data, [
          "_id", "title", "genres", "format", "city",
          "startTime", "status", "coverImage",
        ]);
      } catch (e) { /* 活动可能已被删除 */ }
      enriched.push(Object.assign({}, app, { activity: actInfo }));
    }

    return enriched;
  }

  /**
   * 获取我创建的活动
   */
  async function _getMyCreated(openid, data) {
    var limit = data.limit || 20;
    var page = data.page || 1;
    var skip = (page - 1) * limit;
    var conditions = { _openid: openid };

    if (data.status) {
      conditions.status = data.status;
    } else {
      conditions.status = _.neq("deleted");
    }

    var result = await activitiesCol
      .where(conditions)
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    // 附带申请统计
    var activities = result.data || [];
    var enriched = [];

    for (var i = 0; i < activities.length; i++) {
      var act = activities[i];
      var appStats = await applicationsCol
        .where({ activityId: act._id })
        .get();
      var allApps = appStats.data || [];
      var pendingCount = allApps.filter(function (a) { return a.status === "pending"; }).length;

      enriched.push(Object.assign({}, act, {
        pendingAppCount: pendingCount,
        totalAppCount: allApps.length,
      }));
    }

    return enriched;
  }

  // ─────────────────────────────────────────────────────
  // 举报系统
  // ─────────────────────────────────────────────────────

  /**
   * 创建举报
   */
  async function _createReport(openid, data) {
    if (!data.targetId) throw new Error("缺少举报目标");
    if (!data.category) throw new Error("请选择举报类别");

    // 检查是否已举报
    var existing = await reportsCol
      .where({
        reporterOpenid: openid,
        targetId: data.targetId,
        targetType: data.targetType || "activity",
      })
      .limit(1)
      .get();
    if (existing.data && existing.data.length > 0) {
      throw new Error("你已举报过该内容");
    }

    var report = {
      reporterOpenid: openid,
      targetId: data.targetId,
      targetType: data.targetType || "activity", // activity | user | comment
      category: data.category,
      description: data.description || "",
      evidence: _ensureArray(data.evidence || data.attachments),
      status: "pending",
      aiTriage: null,
      createdAt: _now(),
      updatedAt: _now(),
    };

    // AI 自动分类
    report.aiTriage = aiCore.triageReport(report);
    report.priority = report.aiTriage.severity === "high" ? "urgent"
      : report.aiTriage.severity === "medium" ? "normal"
        : "low";

    var result = await reportsCol.add({ data: report });
    report._id = result._id;

    // 增加被举报人的举报计数
    if (data.targetOpenid) {
      await usersCol.where({ _openid: data.targetOpenid }).update({
        data: { reportCount: _.inc(1), updatedAt: _now() },
      });
    }

    return {
      reported: true,
      reportId: result._id,
      aiTriage: report.aiTriage,
    };
  }

  /**
   * 处理举报（运营操作）
   */
  async function _resolveReport(openid, data) {
    if (!data.reportId) throw new Error("缺少举报 ID");
    if (!data.resolution) throw new Error("缺少处理结果");

    var reportResult = await reportsCol.doc(data.reportId).get();
    if (!reportResult.data) throw new Error("举报不存在");

    await reportsCol.doc(data.reportId).update({
      data: {
        status: "resolved",
        resolution: data.resolution, // dismiss | warn | ban | remove_content
        resolverNote: data.note || "",
        resolvedBy: openid,
        resolvedAt: _now(),
        updatedAt: _now(),
      },
    });

    // 根据处理结果执行后续操作
    var report = reportResult.data;

    if (data.resolution === "remove_content" && report.targetType === "activity") {
      await activitiesCol.doc(report.targetId).update({
        data: { status: "removed", moderationStatus: "blocked", updatedAt: _now() },
      });
    }

    if (data.resolution === "ban" && report.targetOpenid) {
      await usersCol.where({ _openid: report.targetOpenid }).update({
        data: { status: "banned", updatedAt: _now() },
      });
    }

    if (data.resolution === "dismiss") {
      // 举报无效，减少被举报人的举报计数
      if (report.targetOpenid) {
        await usersCol.where({ _openid: report.targetOpenid }).update({
          data: { reportCount: _.inc(-1), updatedAt: _now() },
        });
      }
    }

    return { resolved: true, reportId: data.reportId, resolution: data.resolution };
  }

  /**
   * 处理活动审核（内容安全审核）
   */
  async function _resolveActivityReview(openid, data) {
    if (!data.activityId) throw new Error("缺少活动 ID");
    if (!data.decision) throw new Error("缺少审核决定（pass/reject）");

    var actResult = await activitiesCol.doc(data.activityId).get();
    if (!actResult.data) throw new Error("活动不存在");

    var newStatus = data.decision === "pass" ? "open" : "rejected";
    var moderationStatus = data.decision === "pass" ? "passed" : "blocked";

    await activitiesCol.doc(data.activityId).update({
      data: {
        status: newStatus,
        moderationStatus: moderationStatus,
        reviewNote: data.note || "",
        reviewedBy: openid,
        reviewedAt: _now(),
        updatedAt: _now(),
      },
    });

    return {
      resolved: true,
      activityId: data.activityId,
      newStatus: newStatus,
      moderationStatus: moderationStatus,
    };
  }

  // ─────────────────────────────────────────────────────
  // AI 助手
  // ─────────────────────────────────────────────────────

  /**
   * AI 助手路由
   */
  async function _aiAssist(openid, data) {
    var action = data.action || data.type;
    if (!action) throw new Error("缺少 AI 操作类型");

    // 获取用户信息
    var user = null;
    try {
      user = await _me(openid);
    } catch (e) { /* ignore */ }

    switch (action) {
      case "profile_analysis": {
        return aiCore.analyzeProfileEnhanced
          ? await aiCore.analyzeProfileEnhanced(cloud, user || data.user)
          : aiCore.analyzeProfile(user || data.user);
      }

      case "activity_draft": {
        return aiCore.draftActivityEnhanced
          ? await aiCore.draftActivityEnhanced(cloud, data.form || data)
          : aiCore.draftActivity(data.form || data);
      }

      case "content_moderate": {
        return aiCore.moderateContent(data.text, data.fields);
      }

      case "score_activity": {
        var act = data.activity;
        if (data.activityId && !act) {
          var actRes = await activitiesCol.doc(data.activityId).get();
          act = actRes.data;
        }
        return aiCore.scoreActivity(act, user);
      }

      case "explain_match": {
        var matchAct = data.activity;
        if (data.activityId && !matchAct) {
          var matchActRes = await activitiesCol.doc(data.activityId).get();
          matchAct = matchActRes.data;
        }
        var scoreResult = aiCore.scoreActivity(matchAct, user);
        return aiCore.explainMatchEnhanced
          ? await aiCore.explainMatchEnhanced(cloud, matchAct, user, scoreResult.dimensions)
          : aiCore.explainMatch(matchAct, user, scoreResult.dimensions);
      }

      case "review_hint": {
        var applicant = data.applicant;
        var hintActivity = data.activity;
        if (data.applicationId && !applicant) {
          var appRes = await applicationsCol.doc(data.applicationId).get();
          applicant = appRes.data ? appRes.data.applicantProfile : null;
        }
        if (data.activityId && !hintActivity) {
          var hintActRes = await activitiesCol.doc(data.activityId).get();
          hintActivity = hintActRes.data;
        }
        return aiCore.reviewHint(applicant, hintActivity);
      }

      case "report_triage": {
        return aiCore.triageReport(data.report || data);
      }

      case "ai_workbench": {
        // 获取用户的活动和统计
        var userActs = [];
        var userStats = {};
        if (openid) {
          var actRes = await activitiesCol
            .where({ status: _.neq("deleted") })
            .orderBy("createdAt", "desc")
            .limit(20)
            .get();
          userActs = actRes.data || [];

          try {
            var u = await _me(openid);
            userStats = {
              createdCount: u.createdCount || 0,
              attendedCount: u.attendedCount || 0,
              connections: u.matchCount || 0,
              reviewsGiven: u.reviewGivenCount || 0,
              reviewsReceived: u.reviewCount || 0,
              genresExplored: (u.genres || []).length,
            };
          } catch (e) { /* ignore */ }
        }
        return aiCore.buildAiWorkbench(userActs, user, userStats);
      }

      case "free_chat": {
        if (aiCore.aiAssist) {
          return aiCore.aiAssist(cloud, "free_chat", data);
        }
        return { success: false, message: "AI 对话功能暂未开放" };
      }

      default: {
        // 尝试使用通用路由
        if (aiCore.aiAssist) {
          return aiCore.aiAssist(cloud, action, data);
        }
        throw new Error("未知的 AI 操作：" + action);
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // 统一路由
  // ─────────────────────────────────────────────────────

  var _routes = {
    // 用户
    login: _login,
    me: _me,
    getDashboard: _getDashboard,
    updateProfile: _updateProfile,

    // 活动
    createActivity: _createActivity,
    cancelActivity: _cancelActivity,
    applyActivity: _applyActivity,
    withdrawApplication: _withdrawApplication,
    confirmAttendance: _confirmAttendance,

    // 推荐 & 详情
    recommendations: _getRecommendations,
    getActivityDetail: _getActivityDetail,
    reviewApplication: _reviewApplication,

    // 反馈 & 互动
    recordRecommendationFeedback: _recordRecommendationFeedback,
    recordActivityShare: _recordActivityShare,
    blockActivityCreator: _blockActivityCreator,

    // 评价
    submitMatchReview: _submitMatchReview,
    getMatchRatingProfile: _getMatchRatingProfile,
    getReliabilityProfile: _getReliabilityProfile,
    getAiProfile: _getAiProfile,

    // 匹配意向
    createMatchIntent: _createMatchIntent,
    listIntentPools: _listIntentPools,

    // 运营
    getOpsQueue: _getOpsQueue,
    getOpsFunnel: _getOpsFunnel,
    getCityOpsSummary: _getCityOpsSummary,

    // 我的数据
    getMyApplications: _getMyApplications,
    getMyCreated: _getMyCreated,

    // 举报
    createReport: _createReport,
    resolveReport: _resolveReport,
    resolveActivityReview: _resolveActivityReview,

    // AI
    aiAssist: _aiAssist,
  };

  /**
   * 统一处理函数
   */
  async function handle(action, data, userInfo) {
    if (!action) throw new Error("缺少 action 参数");

    var handler = _routes[action];
    if (!handler) {
      throw new Error("未知操作：" + action + "。支持的操作：" + Object.keys(_routes).join(", "));
    }

    var openid = (userInfo && userInfo.openId) || (data && data.openid) || "";

    // login 特殊处理：openid 由微信注入
    if (action === "login") {
      return handler(openid);
    }

    // 需要登录的操作
    var noAuthActions = ["recommendations", "getActivityDetail"];
    if (noAuthActions.indexOf(action) < 0 && !openid) {
      throw new Error("请先登录");
    }

    return handler(openid, data || {});
  }

  return { handle: handle };
}

module.exports = { createApi: createApi };
