# 视频文案提取器

输入 B站/抖音视频链接，一键提取视频文案。支持字幕直接提取和腾讯云 ASR 语音识别两种模式。

## 功能特性

- **B站视频**: 优先提取 CC/AI 字幕，无字幕时自动走语音识别
- **抖音视频**: 解析无水印视频，通过语音识别提取文案
- **文案操作**: 一键复制、下载 TXT、历史记录
- **暗色 UI**: 媒体工作室风格，响应式设计

## 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS + Vite
- **状态管理**: Zustand
- **后端**: Express (本地开发) / EdgeOne Edge Functions (生产部署)
- **语音识别**: 腾讯云 ASR 录音文件识别 API

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入腾讯云 ASR 密钥：

```bash
cp .env.example .env
```

在 [腾讯云 API 密钥管理](https://console.cloud.tencent.com/cam/capi) 获取：
- `TENCENT_SECRET_ID` — SecretId
- `TENCENT_SECRET_KEY` — SecretKey

> 注：需开通 [腾讯云 ASR 服务](https://console.cloud.tencent.com/asr)

### 3. 启动开发服务器

```bash
npm run dev
```

前端运行在 `http://localhost:5173`，后端 API 运行在 `http://localhost:3001`。

## 部署到腾讯云 EdgeOne Pages

### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "视频文案提取器"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

### 2. 在 EdgeOne Pages 创建项目

1. 登录 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
2. 进入 **站点加速** → **Pages** → **创建项目**
3. 选择 **从 Git 仓库导入**，连接 GitHub 并选择你的仓库
4. 构建配置（通常自动检测）：
   - **框架**: Vite
   - **构建命令**: `npm run build`
   - **输出目录**: `dist`
5. Edge Functions 会自动从 `edge-functions/` 目录部署

### 3. 配置环境变量

在 EdgeOne Pages 项目设置 → **环境变量** 中添加：

| 变量名 | 值 |
|--------|-----|
| `TENCENT_SECRET_ID` | 你的腾讯云 SecretId |
| `TENCENT_SECRET_KEY` | 你的腾讯云 SecretKey |

### 4. 部署

点击 **部署**，等待构建完成后即可获得线上访问地址，分享给朋友使用。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/bilibili` | B站文案提取，body: `{ "url": "B站链接" }` |
| POST | `/api/douyin` | 抖音文案提取，body: `{ "url": "抖音链接" }` |
| GET | `/api/asr/poll?taskId=xxx` | 轮询 ASR 识别结果 |
| GET | `/api/health` | 健康检查 |

## 项目结构

```
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   ├── pages/              # 页面 (Home, History)
│   ├── store/              # Zustand 状态管理
│   ├── lib/                # 工具函数 (API客户端, 平台检测, 历史记录)
│   └── ...
├── api/                    # Express 后端 (本地开发)
│   ├── routes/             # API 路由
│   └── services/           # 业务服务 (B站, 抖音, 腾讯云ASR)
├── edge-functions/         # EdgeOne Edge Functions (生产部署)
│   └── api/                # 纯 JS 实现的边缘函数
├── shared/                 # 前后端共享类型
└── ...
```

## 支持的链接格式

**B站:**
- `https://www.bilibili.com/video/BV1xxxxxxxx`
- `https://b23.tv/xxxxxxx` (短链)
- `BV1xxxxxxxx` (纯BV号)

**抖音:**
- `https://v.douyin.com/xxxxxxx/` (短链)
- 抖音 App 分享文本 (自动提取链接)

## 注意事项

- B站字幕提取依赖视频已有 CC/AI 字幕，无字幕时走 ASR（需要腾讯云密钥）
- 抖音视频解析受平台反爬策略影响，可能偶尔失败
- ASR 语音识别为异步任务，通常需要 10-60 秒
- 历史记录存储在浏览器 localStorage 中，最多保留 20 条
- 仅供学习交流使用，请遵守各平台的使用条款
