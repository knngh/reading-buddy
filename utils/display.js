/**
 * 读书搭子 - 显示工具模块
 * 定义所有领域常量和格式化函数
 */

// ---------- 书籍类型 ----------
const GENRE_OPTIONS = [
  { value: "literature", label: "文学小说" },
  { value: "business", label: "商业管理" },
  { value: "tech", label: "科技互联网" },
  { value: "history", label: "历史人文" },
  { value: "psychology", label: "心理学" },
  { value: "philosophy", label: "哲学思想" },
  { value: "self_help", label: "自我提升" },
  { value: "art", label: "艺术设计" },
  { value: "scifi", label: "科幻悬疑" },
  { value: "biography", label: "人物传记" },
  { value: "education", label: "教育学习" }
];

// ---------- 阅读水平 ----------
const LEVEL_OPTIONS = [
  { value: "beginner", label: "入门读者" },
  { value: "intermediate", label: "进阶读者" },
  { value: "advanced", label: "资深读者" },
  { value: "all", label: "不限水平" }
];

// ---------- 时间档 ----------
const SLOT_OPTIONS = [
  { value: "weekday_morning", label: "工作日上午" },
  { value: "weekday_afternoon", label: "工作日下午" },
  { value: "weekday_evening", label: "工作日晚上" },
  { value: "weekend_morning", label: "周末上午" },
  { value: "weekend_afternoon", label: "周末下午" },
  { value: "weekend_evening", label: "周末晚上" }
];

// ---------- 书籍获取方式 ----------
const BOOK_MODE_OPTIONS = [
  { value: "bring_own", label: "自带书籍" },
  { value: "shared", label: "共享书籍" },
  { value: "aa_buy", label: "AA购买" }
];

// ---------- 活动形式 ----------
const FORMAT_OPTIONS = [
  { value: "offline", label: "线下共读" },
  { value: "online", label: "线上共读" },
  { value: "hybrid", label: "线上+线下" }
];

// ---------- 城市场景（含区县） ----------
const CITY_DATA = {
  "北京": {
    districts: ["朝阳区", "海淀区", "东城区", "西城区", "丰台区", "通州区", "大兴区", "昌平区"]
  },
  "上海": {
    districts: ["浦东新区", "徐汇区", "静安区", "黄浦区", "长宁区", "虹口区", "杨浦区", "闵行区"]
  },
  "广州": {
    districts: ["天河区", "越秀区", "海珠区", "荔湾区", "白云区", "番禺区", "黄埔区"]
  },
  "深圳": {
    districts: ["南山区", "福田区", "罗湖区", "宝安区", "龙岗区", "龙华区", "光明区"]
  },
  "杭州": {
    districts: ["西湖区", "上城区", "拱墅区", "滨江区", "余杭区", "萧山区", "钱塘区"]
  }
};
const CITY_OPTIONS = Object.keys(CITY_DATA);

// ---------- 查找函数 ----------
function findByValue(list, value) {
  return list.find(function (item) { return item.value === value; });
}

function genreLabel(value) {
  var found = findByValue(GENRE_OPTIONS, value);
  return found ? found.label : value || "未设置";
}

function levelLabel(value) {
  var found = findByValue(LEVEL_OPTIONS, value);
  return found ? found.label : value || "未设置";
}

function slotLabel(value) {
  var found = findByValue(SLOT_OPTIONS, value);
  return found ? found.label : value || "未设置";
}

function bookModeLabel(value) {
  var found = findByValue(BOOK_MODE_OPTIONS, value);
  return found ? found.label : value || "未设置";
}

function formatLabel(value) {
  var found = findByValue(FORMAT_OPTIONS, value);
  return found ? found.label : value || "未设置";
}

// ---------- 时间格式化 ----------
function formatDateTime(dateStr) {
  if (!dateStr) return "待定";
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return "待定";
  var month = d.getMonth() + 1;
  var day = d.getDate();
  var hour = d.getHours();
  var min = d.getMinutes();
  var weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var weekDay = weekDays[d.getDay()];
  return month + "月" + day + "日 " + weekDay + " " +
    (hour < 10 ? "0" : "") + hour + ":" + (min < 10 ? "0" : "") + min;
}

function formatDate(dateStr) {
  if (!dateStr) return "待定";
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return "待定";
  return d.getFullYear() + "-" +
    ((d.getMonth() + 1) < 10 ? "0" : "") + (d.getMonth() + 1) + "-" +
    (d.getDate() < 10 ? "0" : "") + d.getDate();
}

function formatTime(dateStr) {
  if (!dateStr) return "待定";
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return "待定";
  var hour = d.getHours();
  var min = d.getMinutes();
  return (hour < 10 ? "0" : "") + hour + ":" + (min < 10 ? "0" : "") + min;
}

// ---------- 文本拼接 ----------
function joinTexts(arr, separator) {
  if (!arr || !arr.length) return "";
  return arr.join(separator || " / ");
}

// ---------- 状态标签 ----------
function statusLabel(status) {
  var map = {
    open: "报名中",
    matched: "已成团",
    cancelled: "已取消",
    closed: "已结束"
  };
  return map[status] || status || "未知";
}

function applicationStatusLabel(status) {
  var map = {
    pending: "待审核",
    accepted: "已通过",
    rejected: "已拒绝",
    waitlisted: "候补中",
    cancelled: "已取消"
  };
  return map[status] || status || "未知";
}

function statusClass(status) {
  return "status-" + (status || "pending");
}

// ---------- 活动标签构建 ----------
function buildActivityTags(activity) {
  var tags = [];
  if (activity.genre) tags.push(genreLabel(activity.genre));
  if (activity.readingLevel) {
    var ll = levelLabel(activity.readingLevel);
    if (ll !== "不限水平") tags.push(ll);
  }
  if (activity.bookMode) tags.push(bookModeLabel(activity.bookMode));
  if (activity.format) tags.push(formatLabel(activity.format));
  return tags;
}

// ---------- 导出 ----------
module.exports = {
  GENRE_OPTIONS: GENRE_OPTIONS,
  LEVEL_OPTIONS: LEVEL_OPTIONS,
  SLOT_OPTIONS: SLOT_OPTIONS,
  BOOK_MODE_OPTIONS: BOOK_MODE_OPTIONS,
  FORMAT_OPTIONS: FORMAT_OPTIONS,
  CITY_OPTIONS: CITY_OPTIONS,
  CITY_DATA: CITY_DATA,
  genreLabel: genreLabel,
  levelLabel: levelLabel,
  slotLabel: slotLabel,
  bookModeLabel: bookModeLabel,
  formatLabel: formatLabel,
  formatDateTime: formatDateTime,
  formatDate: formatDate,
  formatTime: formatTime,
  joinTexts: joinTexts,
  statusLabel: statusLabel,
  applicationStatusLabel: applicationStatusLabel,
  statusClass: statusClass,
  buildActivityTags: buildActivityTags,
  findByValue: findByValue
};
