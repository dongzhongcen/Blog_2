# dongzhongcen's Blog（Blog_2）

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/node.js-express%205.x-339933">
  <img alt="Neon" src="https://img.shields.io/badge/neon-serverless%20postgres-00e599">
  <img alt="React" src="https://img.shields.io/badge/react-19.x-61dafb">
  <img alt="Vite" src="https://img.shields.io/badge/vite-7.x-646cff">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.x-blue">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/tailwindcss-3.x-38bdf8">
</p>

Blog_2 是 dongzhongcen 个人博客的前后端项目，包含一个基于 Express 5 和 Neon PostgreSQL 的博客 API 服务（`api/`），以及一个 React + Vite + TypeScript 前端（`app/`）。项目目前实现了文章浏览量、点赞、评论、评论点赞、贡献热力图数据和全站统计等 API；前端目录中目前只有构建产物和配置文件。

## 功能特性

- **健康检查**：`GET /api/health`。
- **文章统计**：获取单篇（`GET /api/posts/:postId/stats`）或批量（`POST /api/posts/stats`）文章的浏览量、点赞数等统计。
- **浏览量**：`POST /api/posts/:postId/view`，按 30 分钟会话去重计数。
- **文章点赞**：`POST /api/posts/:postId/like`，基于 User-Agent + IP 生成的指纹切换点赞状态。
- **评论**：获取（`GET /api/posts/:postId/comments`）、发表（`POST /api/posts/:postId/comments`，内容不超过 2000 字）、删除（`DELETE /api/comments/:commentId`）评论，以及评论点赞（`POST /api/comments/:commentId/like`）。
- **贡献热力图**：`GET /api/contributions?year=`，按日汇总发文、浏览、评论、点赞数量并划分为 0–4 级。
- **全站统计**：`GET /api/stats`，返回文章总数、总浏览量、总点赞数和评论总数。

## 项目结构

```text
.
├── api/                 # 博客 API 服务
│   ├── index.js         # Express 应用和全部路由
│   ├── .env.example     # DATABASE_URL、PORT、CORS_ORIGIN
│   └── package.json
└── app/                 # React + Vite 前端
    ├── dist/            # 前端构建产物
    ├── index.html
    ├── components.json  # shadcn/ui 配置
    ├── .env.example     # VITE_API_URL
    └── package.json
```

## 快速开始

### 环境要求

- Node.js 与 npm（`npm run dev` 使用 `node --watch`）
- 一个 Neon PostgreSQL 数据库，并已创建 API 所需的表和函数（`post_stats`、`comments`、`comment_likes`、`user_likes`、`daily_stats`，以及 `increment_post_views`、`toggle_post_like`、`add_post_comment` 等函数）

### 启动 API 服务

```bash
cd api
cp .env.example .env   # 填写 DATABASE_URL，可修改 PORT（默认 3001）和 CORS_ORIGIN
npm install
npm run dev
```

生产环境使用：

```bash
npm start
```

### 前端配置

前端通过 `app/.env.example` 中的 `VITE_API_URL` 配置 API 地址（开发环境默认 `http://localhost:3001/api`）。`app/package.json` 提供了 `dev`、`build`、`lint`、`preview` 脚本，但仓库中目前缺少 `app/src/` 源码，只能使用 `app/dist/` 中的构建产物。

## 当前状态

API 服务的主要接口已经完成，前端仅保留了构建产物。后续可继续完善：

- 补充前端 `app/src/` 源码
- 补充数据库建表和函数的 SQL 脚本
- 为删除评论接口增加权限校验（目前任何人都可以调用）
- 增加 `.gitignore`，并从仓库中移除已提交的 `api/node_modules/`
- 替换 `app/README.md` 中的 Vite 模板说明
