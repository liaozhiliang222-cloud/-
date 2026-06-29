# SynthUser PWA 部署指南

## 已完成的 PWA 优化

1. ✅ 生成多尺寸 PNG 图标（192x192、512x512、maskable 版本）
2. ✅ 更新 `manifest.webmanifest`，添加完整的 icons 配置
3. ✅ 更新 `index.html`，添加 `apple-touch-icon` PNG 链接
4. ✅ 更新 `sw.js`（Service Worker），缓存新版本资源
5. ✅ 初始化 Git 仓库，提交所有更改

## 推荐部署方案

### 方案 A：Netlify Drop（最简单，无需命令行）

1. 打开浏览器，访问 [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. 将本项目的文件夹直接拖拽到网页中
3. 等待几秒，即可获得一个 `https://xxx.netlify.app` 的永久链接
4. 访问链接，在浏览器地址栏右侧会出现安装图标（➕）

**优点**：零配置、自动 HTTPS、全球 CDN、支持自定义域名

### 方案 B：Vercel（推荐，功能最完善）

需要 Vercel 账号（可用 GitHub 账号登录）。

#### 方式 1：Vercel CLI（命令行）

```bash
# 1. 全局安装 Vercel CLI
npm install -g vercel

# 2. 登录（按提示使用浏览器或 token 登录）
vercel login

# 3. 进入项目目录并部署
vercel --prod
```

#### 方式 2：Git 导入（推荐）

1. 将本项目推送到 GitHub 仓库
2. 访问 [https://vercel.com/new](https://vercel.com/new)
3. 导入 GitHub 仓库，一键部署

**优点**：自动 HTTPS、分支预览、边缘网络、Analytics 支持

### 方案 C：GitHub Pages（免费，适合开源项目）

1. 将本项目推送到 GitHub 仓库
2. 在仓库 Settings → Pages → Source 中选择分支
3. 选择 `main` 分支的根目录，保存
4. 访问 `https://你的用户名.github.io/仓库名/`

**注意**：GitHub Pages 的 URL 带有路径前缀，需要修改 `manifest.webmanifest` 中的 `start_url` 和 `scope` 以及 `sw.js` 中的缓存路径。

### 方案 D：Cloudflare Pages

1. 访问 [https://dash.cloudflare.com](https://dash.cloudflare.com) → Pages
2. 创建项目，上传文件夹或连接 Git 仓库
3. 自动部署

**优点**：全球 CDN、自动 HTTPS、Workers 集成

## 部署后的 PWA 验证

部署完成后，打开站点，按 `F12` → **Lighthouse** → 勾选 **PWA**，运行审计：

- 期望看到：Installable ✅
- 在 Chrome 地址栏右侧会出现安装图标
- 在 Android Chrome 上可通过菜单 → "安装应用"
- 在 iOS Safari 上可通过"分享" → "添加到主屏幕"

## 如果需要更新应用

修改代码后，更新 `sw.js` 中的 `CACHE_NAME` 版本号（如 `v13` → `v14`），确保用户能获取最新版本。

