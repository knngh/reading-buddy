/**
 * 读书搭子小程序 - 显示层工具函数（云函数侧副本）
 *
 * 本文件与 utils/display.js 保持同步，仅保留纯数据 / 纯函数逻辑，
 * 不含任何 wx.* 调用，便于在云函数中安全引用。
 */

// ─────────────────────────────────────────────────────────
// 常量选项列表
// ─────────────────────────────────────────────────────────

const GENRE_OPTIONS = [
  { value: "literature", label: "文学小说", icon: "📖" },
  { value: "philosophy", label: "哲学思想", icon: "🧠" },
  { value: "history", label: "历史传记", icon: "🏛️" },
  { value: "science", label: "科学技术", icon: "🔬" },
  { value: "business", label: "商业经管", icon: "💼" },
  { value: "psychology", label: "心理成长", icon: "🌱" },
  { value: "art", label: "艺术设计", icon: "🎨" },
  { value: "social", label: "社会科学", icon: "🌍" },
  { value: "self_help", label: "自我提升", icon: "⚡" },
  { value: "lifestyle", label: "生活美学", icon: "☕" },
  { value: "tech", label: "编程技术", icon: "💻" },
  { value: "education", label: "教育学习", icon: "🎓" },
];

const LEVEL_OPTIONS = [
  { value: "beginner", label: "入门读者", desc: "刚开始培养阅读习惯" },
  { value: "casual", label: "休闲读者", desc: "偶尔阅读，享受为主" },
  { value: "regular", label: "稳定读者", desc: "每月固定阅读 2-4 本" },
  { value: "avid", label: "深度读者", desc: "阅读是生活的一部分" },
  { value: "expert", label: "专业研究者", desc: "某领域的深度阅读者" },
];

const SLOT_OPTIONS = [
  { value: "weekday_morning", label: "工作日上午", period: "06:00-12:00" },
  { value: "weekday_afternoon", label: "工作日下午", period: "12:00-18:00" },
  { value: "weekday_evening", label: "工作日晚间", period: "18:00-23:00" },
  { value: "weekend_morning", label: "周末上午", period: "06:00-12:00" },
  { value: "weekend_afternoon", label: "周末下午", period: "12:00-18:00" },
  { value: "weekend_evening", label: "周末晚间", period: "18:00-23:00" },
  { value: "flexible", label: "灵活协商", period: "随时可约" },
];

const BOOK_MODE_OPTIONS = [
  { value: "together", label: "共读同一本", desc: "大家一起读同一本书，交流更深入" },
  { value: "theme", label: "主题选书", desc: "围绕主题各选一本，视角更丰富" },
  { value: "free", label: "自由选书", desc: "各自读感兴趣的书，分享阅读体验" },
  { value: "leader_pick", label: "发起人指定", desc: "由活动发起人选定书目" },
];

const FORMAT_OPTIONS = [
  { value: "offline", label: "线下见面", icon: "🏠", desc: "面对面交流，更有氛围" },
  { value: "online_video", label: "线上视频", icon: "📹", desc: "视频连线，跨越距离" },
  { value: "online_voice", label: "线上语音", icon: "🎙️", desc: "语音交流，轻松自在" },
  { value: "chat", label: "文字讨论", icon: "💬", desc: "群聊讨论，时间灵活" },
  { value: "hybrid", label: "线上线下结合", icon: "🔄", desc: "两种方式都有" },
];

const CITY_OPTIONS = [
  { value: "beijing", label: "北京", short: "京" },
  { value: "shanghai", label: "上海", short: "沪" },
  { value: "guangzhou", label: "广州", short: "穗" },
  { value: "shenzhen", label: "深圳", short: "深" },
  { value: "hangzhou", label: "杭州", short: "杭" },
  { value: "chengdu", label: "成都", short: "蓉" },
  { value: "wuhan", label: "武汉", short: "汉" },
  { value: "nanjing", label: "南京", short: "宁" },
  { value: "xian", label: "西安", short: "长安" },
  { value: "changsha", label: "长沙", short: "湘" },
  { value: "chongqing", label: "重庆", short: "渝" },
  { value: "suzhou", label: "苏州", short: "苏" },
  { value: "tianjin", label: "天津", short: "津" },
  { value: "xiamen", label: "厦门", short: "鹭" },
  { value: "qingdao", label: "青岛", short: "青" },
  { value: "dalian", label: "大连", short: "连" },
  { value: "other", label: "其他城市", short: "其他" },
  { value: "online", label: "线上不限", short: "线上" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿", color: "#999" },
  { value: "open", label: "招募中", color: "#07c160" },
  { value: "full", label: "已满员", color: "#ff976a" },
  { value: "ongoing", label: "进行中", color: "#1989fa" },
  { value: "completed", label: "已完成", color: "#969799" },
  { value: "cancelled", label: "已取消", color: "#ee0a24" },
];

const APPLICATION_STATUS_OPTIONS = [
  { value: "pending", label: "待审核", color: "#ff976a" },
  { value: "accepted", label: "已通过", color: "#07c160" },
  { value: "rejected", label: "未通过", color: "#ee0a24" },
  { value: "withdrawn", label: "已撤回", color: "#969799" },
  { value: "attended", label: "已参加", color: "#1989fa" },
  { value: "no_show", label: "未到场", color: "#ee0a24" },
];

// ─────────────────────────────────────────────────────────
// 标签查询工具
// ─────────────────────────────────────────────────────────

function _findByValue(options, value) {
  if (!value) return null;
  return options.find(function (o) { return o.value === value; }) || null;
}

function _findMultiple(options, values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(function (v) { return _findByValue(options, v); })
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────
// 显示标签函数
// ─────────────────────────────────────────────────────────

/**
 * 获取类型标签
 */
function genreLabel(value) {
  var item = _findByValue(GENRE_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取类型图标
 */
function genreIcon(value) {
  var item = _findByValue(GENRE_OPTIONS, value);
  return item ? item.icon : "📚";
}

/**
 * 批量获取类型标签
 */
function genreLabels(values) {
  return _findMultiple(GENRE_OPTIONS, values).map(function (o) { return o.label; });
}

/**
 * 获取阅读等级标签
 */
function levelLabel(value) {
  var item = _findByValue(LEVEL_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取阅读等级描述
 */
function levelDesc(value) {
  var item = _findByValue(LEVEL_OPTIONS, value);
  return item ? item.desc : "";
}

/**
 * 获取时间槽标签
 */
function slotLabel(value) {
  var item = _findByValue(SLOT_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取时间槽时段
 */
function slotPeriod(value) {
  var item = _findByValue(SLOT_OPTIONS, value);
  return item ? item.period : "";
}

/**
 * 获取选书模式标签
 */
function bookModeLabel(value) {
  var item = _findByValue(BOOK_MODE_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取选书模式描述
 */
function bookModeDesc(value) {
  var item = _findByValue(BOOK_MODE_OPTIONS, value);
  return item ? item.desc : "";
}

/**
 * 获取活动形式标签
 */
function formatLabel(value) {
  var item = _findByValue(FORMAT_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取活动形式图标
 */
function formatIcon(value) {
  var item = _findByValue(FORMAT_OPTIONS, value);
  return item ? item.icon : "📚";
}

/**
 * 获取活动形式描述
 */
function formatDesc(value) {
  var item = _findByValue(FORMAT_OPTIONS, value);
  return item ? item.desc : "";
}

/**
 * 获取城市标签
 */
function cityLabel(value) {
  var item = _findByValue(CITY_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取城市简称
 */
function cityShort(value) {
  var item = _findByValue(CITY_OPTIONS, value);
  return item ? item.short : value || "其他";
}

/**
 * 获取活动状态标签
 */
function statusLabel(value) {
  var item = _findByValue(STATUS_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取活动状态颜色
 */
function statusColor(value) {
  var item = _findByValue(STATUS_OPTIONS, value);
  return item ? item.color : "#999";
}

/**
 * 获取申请状态标签
 */
function applicationStatusLabel(value) {
  var item = _findByValue(APPLICATION_STATUS_OPTIONS, value);
  return item ? item.label : value || "未知";
}

/**
 * 获取申请状态颜色
 */
function applicationStatusColor(value) {
  var item = _findByValue(APPLICATION_STATUS_OPTIONS, value);
  return item ? item.color : "#999";
}

// ─────────────────────────────────────────────────────────
// 格式化辅助函数
// ─────────────────────────────────────────────────────────

/**
 * 格式化人数显示
 */
function formatMemberCount(current, max) {
  if (!max || max <= 0) return String(current || 0) + "人";
  return (current || 0) + "/" + max + "人";
}

/**
 * 格式化日期显示（相对时间）
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  var date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (date.toDate) date = date.toDate(); // 处理云数据库 Date 类型
  var now = new Date();
  var diff = now.getTime() - date.getTime();
  var minutes = Math.floor(diff / 60000);
  var hours = Math.floor(diff / 3600000);
  var days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return minutes + "分钟前";
  if (hours < 24) return hours + "小时前";
  if (days < 7) return days + "天前";
  if (days < 30) return Math.floor(days / 7) + "周前";

  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, "0");
  var d = String(date.getDate()).padStart(2, "0");
  if (y === now.getFullYear()) return m + "-" + d;
  return y + "-" + m + "-" + d;
}

/**
 * 格式化活动时间段显示
 */
function formatActivityTime(startTime, endTime) {
  if (!startTime) return "待定";
  var start = typeof startTime === "string" ? new Date(startTime) : startTime;
  if (start.toDate) start = start.toDate();

  var months = ["1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月"];
  var weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  var result = months[start.getMonth()] + start.getDate() + "日 " +
    weekdays[start.getDay()] + " " +
    String(start.getHours()).padStart(2, "0") + ":" +
    String(start.getMinutes()).padStart(2, "0");

  if (endTime) {
    var end = typeof endTime === "string" ? new Date(endTime) : endTime;
    if (end.toDate) end = end.toDate();
    result += "-" + String(end.getHours()).padStart(2, "0") + ":" +
      String(end.getMinutes()).padStart(2, "0");
  }

  return result;
}

/**
 * 截断文本并添加省略号
 */
function truncate(text, maxLen) {
  if (!text) return "";
  maxLen = maxLen || 50;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

/**
 * 构建活动摘要卡片文字
 */
function activitySummaryCard(activity) {
  if (!activity) return "";
  var parts = [];
  parts.push(activity.title || "未命名活动");
  if (activity.genres && activity.genres.length) {
    parts.push(genreLabels(activity.genres).join(" / "));
  }
  if (activity.city) parts.push(cityLabel(activity.city));
  if (activity.format) parts.push(formatLabel(activity.format));
  if (activity.maxMembers) {
    parts.push(formatMemberCount(activity.currentMembers, activity.maxMembers));
  }
  return parts.join(" · ");
}

/**
 * 构建用户简介一行描述
 */
function userProfileLine(user) {
  if (!user) return "";
  var parts = [];
  if (user.nickname) parts.push(user.nickname);
  if (user.readingLevel) parts.push(levelLabel(user.readingLevel));
  if (user.genres && user.genres.length) {
    parts.push("偏好" + genreLabels(user.genres).join("、"));
  }
  if (user.city) parts.push(cityLabel(user.city));
  return parts.join(" | ");
}

/**
 * 匹配等级对应的视觉配置
 */
function matchGradeConfig(grade) {
  var configs = {
    S: { label: "绝佳匹配", color: "#ee0a24", bgColor: "#fff0f0", stars: 5 },
    A: { label: "高度匹配", color: "#ff976a", bgColor: "#fff7e6", stars: 4 },
    B: { label: "较为匹配", color: "#07c160", bgColor: "#f0fff4", stars: 3 },
    C: { label: "一般匹配", color: "#1989fa", bgColor: "#e6f7ff", stars: 2 },
    D: { label: "匹配度低", color: "#969799", bgColor: "#f5f5f5", stars: 1 },
  };
  return configs[grade] || configs.D;
}

/**
 * 生成活动标签列表（用于前端 tag 组件）
 */
function activityTags(activity) {
  if (!activity) return [];
  var tags = [];
  if (activity.genres) {
    activity.genres.forEach(function (g) {
      tags.push({ text: genreLabel(g), type: "genre" });
    });
  }
  if (activity.format) {
    tags.push({ text: formatLabel(activity.format), type: "format" });
  }
  if (activity.bookMode) {
    tags.push({ text: bookModeLabel(activity.bookMode), type: "bookMode" });
  }
  if (activity.city && activity.city !== "online") {
    tags.push({ text: cityLabel(activity.city), type: "city" });
  }
  if (activity.readingLevel) {
    tags.push({ text: levelLabel(activity.readingLevel), type: "level" });
  }
  return tags;
}

// ─────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────

module.exports = {
  // 选项常量
  GENRE_OPTIONS: GENRE_OPTIONS,
  LEVEL_OPTIONS: LEVEL_OPTIONS,
  SLOT_OPTIONS: SLOT_OPTIONS,
  BOOK_MODE_OPTIONS: BOOK_MODE_OPTIONS,
  FORMAT_OPTIONS: FORMAT_OPTIONS,
  CITY_OPTIONS: CITY_OPTIONS,
  STATUS_OPTIONS: STATUS_OPTIONS,
  APPLICATION_STATUS_OPTIONS: APPLICATION_STATUS_OPTIONS,

  // 标签函数
  genreLabel: genreLabel,
  genreIcon: genreIcon,
  genreLabels: genreLabels,
  levelLabel: levelLabel,
  levelDesc: levelDesc,
  slotLabel: slotLabel,
  slotPeriod: slotPeriod,
  bookModeLabel: bookModeLabel,
  bookModeDesc: bookModeDesc,
  formatLabel: formatLabel,
  formatIcon: formatIcon,
  formatDesc: formatDesc,
  cityLabel: cityLabel,
  cityShort: cityShort,
  statusLabel: statusLabel,
  statusColor: statusColor,
  applicationStatusLabel: applicationStatusLabel,
  applicationStatusColor: applicationStatusColor,

  // 格式化函数
  formatMemberCount: formatMemberCount,
  formatDate: formatDate,
  formatActivityTime: formatActivityTime,
  truncate: truncate,
  activitySummaryCard: activitySummaryCard,
  userProfileLine: userProfileLine,
  matchGradeConfig: matchGradeConfig,
  activityTags: activityTags,
};
