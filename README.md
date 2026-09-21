# 读书搭子 - 微信小程序

一个帮你找到同城读书搭子的微信小程序，支持发布读书活动、AI 智能推荐、报名管理、读后评价等完整流程。

## 功能特性

- **发布+报名模式**：发布线下/线上读书活动，附近书友报名参与
- **AI 推荐引擎**：5 维度加权评分（类型偏好/阅读水平/时间/距离/可信度），S/A/B/C/D 分级
- **读书会（凑局池）**：按书籍类型+城市+区域+时间段聚合读书意向，快速组队
- **内容安全**：手机号/微信号/QQ 号检测 + 敏感词过滤 + AI 内容审核
- **运营仪表盘**：运营漏斗、城市冷启动追踪、AI 优先级工单队列
- **可信度体系**：用户信任分、完成率、确认率、取消率、评价徽章
- **读后评价**：守时/专注度/讨论质量/准备程度 4 维度评分
- **个人 AI 画像**：阅读偏好分析、人格标签、推荐策略

## 技术架构

支持三种后端模式，通过 `config.js` 切换：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `mock` | 本地内存后端，数据持久化到 Storage | 开发调试、Demo 演示 |
| `server` | HTTP API（FastAPI/Express） | 自建服务器部署 |
| `cloud` | 微信云开发 | 生产环境 |

## 快速开始

### 1. 导入项目

```bash
# 用微信开发者工具打开项目根目录
# 填入你的 AppID（在 project.config.json 中修改）
```

### 2. 预览运行

默认 `mock` 模式可直接预览。点击首页 **"演示"** 按钮生成种子数据体验完整流程。

### 3. 配置项

编辑 `config.js`：

```javascript
module.exports = {
  backendMode: "mock",      // "mock" | "server" | "cloud"
  apiBaseUrl: "",            // server 模式的 API 地址
  cloudEnv: "",              // cloud 模式的云环境 ID
  aiProvider: "deepseek",    // AI 服务商
  aiBaseUrl: "https://api.deepseek.com",
  aiModel: "deepseek-v4-flash"
};
```

### 4. 天地图 POI 搜索

编辑 `utils/tianditu.js`，填入你的天地图 API Key。

## 项目结构

```
reading-buddy/
├── app.js / app.json / app.wxss   # 全局配置和样式
├── config.js                       # 后端模式和 AI 配置
├── pages/
│   ├── index/                      # 首页（搭子 Tab）
│   ├── match-list/                 # 推荐列表（推荐 Tab）
│   ├── post-create/                # 发布活动（发布 Tab）
│   ├── chat-list/                  # 管理面板（管理 Tab）
│   ├── profile/                    # 个人中心（我的 Tab）
│   ├── activity-detail/            # 活动详情
│   ├── chat/                       # 消息（占位）
│   └── privacy/                    # 隐私授权
├── utils/
│   ├── display.js                  # 领域常量和格式化
│   ├── request.js                  # API 请求层
│   ├── mock-backend.js             # Mock 后端（3200+ 行）
│   ├── ai-core.js                  # AI 引擎（1900+ 行）
│   ├── location.js                 # 地理位置
│   ├── tianditu.js                 # 天地图 POI
│   ├── privacy.js                  # 隐私授权
│   └── share-poster.js             # 分享海报
└── cloudfunctions/api/             # 云函数后端
    ├── index.js
    ├── service.js                  # 服务层（1700+ 行）
    ├── ai-core.js
    ├── display.js
    └── package.json
```

## 书籍类型

文学小说 / 商业管理 / 科技互联网 / 历史人文 / 心理学 / 哲学思想 / 自我提升 / 艺术设计 / 科幻悬疑 / 人物传记 / 教育学习


## License

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

本项目采用 [AGPL-3.0](./LICENSE) 许可协议开源。基于本项目的修改版本及通过网络提供服务的衍生服务，须以相同协议开源。

