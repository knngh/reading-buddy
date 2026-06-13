/**
 * 读书搭子 - 分享海报构建
 */
var display = require("./display");

/**
 * 构建活动分享卡片数据
 */
function buildActivityPoster(activity) {
  if (!activity) return null;

  var tags = display.buildActivityTags(activity);
  var spotsLeft = (activity.maxParticipants || 0) - (activity.acceptedCount || 0);

  return {
    genre: display.genreLabel(activity.genre),
    title: activity.title || "读书活动",
    time: display.formatDateTime(activity.startAt),
    location: activity.locationName || activity.locationAddress || "待定",
    city: activity.city || "",
    district: activity.district || "",
    tags: tags.slice(0, 4),
    spotsLeft: spotsLeft > 0 ? "还剩 " + spotsLeft + " 个名额" : (spotsLeft === 0 ? "名额已满" : ""),
    description: activity.description || "",
    creatorNickname: activity.creatorNickname || "匿名书友"
  };
}

/**
 * 构建分享转化文案
 */
function buildShareConversion(activity) {
  if (!activity) return { title: "来找个读书搭子吧！", cta: "立即查看" };

  if (activity.status === "cancelled") {
    return { title: "活动已取消", cta: "看看其他活动" };
  }

  var spotsLeft = (activity.maxParticipants || 0) - (activity.acceptedCount || 0);
  if (spotsLeft <= 0) {
    return { title: activity.title + " - 已满员", cta: "加入候补" };
  }

  var genreLabel = display.genreLabel(activity.genre);
  return {
    title: "【" + genreLabel + "】" + activity.title + " - 还有" + spotsLeft + "个名额",
    cta: "立即报名"
  };
}

module.exports = {
  buildActivityPoster: buildActivityPoster,
  buildShareConversion: buildShareConversion
};
