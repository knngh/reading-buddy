/**
 * 读书搭子小程序 - 云函数入口
 *
 * 所有客户端请求统一通过本函数路由：
 *   event.action  —— 操作名称（字符串）
 *   event.data    —— 请求参数（对象）
 *   event.userInfo —— 微信注入的用户身份信息（含 openId）
 */
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { createApi } = require("./service");

exports.main = async (event, context) => {
  const db = cloud.database();
  const api = createApi({ db, cloud });

  const action = event.action;
  const data = event.data || {};
  const userInfo = event.userInfo || {};

  // 简单请求日志（便于云开发控制台排查）
  console.log(
    `[api] action=${action} openid=${(userInfo.openId || "").slice(0, 8)}…`
  );

  try {
    const result = await api.handle(action, data, userInfo);
    return { ok: true, data: result };
  } catch (err) {
    console.error(`[api] ERROR action=${action}`, err);
    return {
      ok: false,
      error: err.message || "服务器错误",
      code: err.code || "INTERNAL",
    };
  }
};
