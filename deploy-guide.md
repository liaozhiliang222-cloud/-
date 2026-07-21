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

### 方案 D：Cloudflare Pages（推荐，与本项目已对接）

本项目已为 Cloudflare Pages 做好全部适配（`_redirects` SPA 回退、`_headers` 缓存策略、PWA Manifest、Service Worker 均已就绪），可一键部署。

#### 方式 1：直接上传文件夹（最快，无需 Git）

1. 访问 [https://dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages → Upload assets
2. Project name 填 `syn`（或任意名称，会决定子域名 `syn.pages.dev`）
3. 把整个 `d:\合成用户\` 目录里**除 `node_modules/`、`.git/`、`dist/` 外**的所有文件拖入上传区
   - 必须包含：`index.html`、`manifest.webmanifest`、`sw.js`、`_redirects`、`_headers`、`src/`、`icons/`
4. 点击 Deploy site，等待 30 秒左右即可获得 `https://syn.pages.dev` 链接
5. 后续更新：重复以上流程，每次部署会生成唯一 preview URL，production URL 永远指向最新版本

#### 方式 2：连接 Git 仓库（推荐长期使用，自动部署）

1. 把 `d:\合成用户\` 推送到 GitHub / GitLab 仓库
   ```bash
   cd d:\合成用户
   git init
   git add .
   git commit -m "init: SynthUser PWA"
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
3. 选择对应仓库，授权 Cloudflare 访问
4. 配置构建设置：
   - **Framework preset**: `None`
   - **Build command**: 留空（纯静态站点，无需构建）
   - **Build output directory**: `/`（根目录）
   - **Root directory**: `/`
5. 点击 Save and Deploy，首次约 1 分钟
6. 此后每次 `git push main`，Cloudflare 会自动构建并部署到生产环境；推送其他分支会生成 preview URL

#### 方式 3：使用 Wrangler CLI（适合自动化 / CI 集成）

```bash
# 1. 安装 Wrangler
npm install -g wrangler

# 2. 登录（首次会打开浏览器授权）
wrangler login

# 3. 在项目根目录执行部署
cd d:\合成用户
wrangler pages deploy . --project-name=syn --branch=main
```

也可在 `package.json` 中加入快捷脚本（本项目已预置）：

```bash
npm run deploy:cf
```

#### 自定义域名（可选）

1. Cloudflare Pages 项目 → Custom domains → Set up a custom domain
2. 输入你的域名（如 `synthuser.yourdomain.com`）
3. 按提示添加 CNAME 记录，Cloudflare 会自动签发 SSL 证书
4. 如果域名也托管在 Cloudflare，DNS 记录会自动添加，无需手动操作

#### 部署后检查清单

部署完成后，访问站点验证：

- [ ] 首页能正常打开，无 404
- [ ] 浏览器地址栏右侧出现 ➕ 安装图标（PWA 可安装）
- [ ] F12 → Application → Service Workers 显示 `sw.js` 已激活
- [ ] F12 → Application → Manifest 正确加载图标和名称
- [ ] 进入「模型设置」页面，智谱 GLM 卡片显示「内置 Key」徽标，可直接试用
- [ ] 切换其他页面（如 `/?mode=quant`）刷新后不会 404（`_redirects` 生效）
- [ ] Network 面板查看 `src/*` 资源返回 `Cache-Control: max-age=31536000, immutable`（`_headers` 生效）

**优点**：全球 CDN、自动 HTTPS、无限请求次数（免费额度 500 次/月构建、不限流量）、与 Workers / R2 集成、原生 PWA 支持

## 部署后的 PWA 验证

部署完成后，打开站点，按 `F12` → **Lighthouse** → 勾选 **PWA**，运行审计：

- 期望看到：Installable ✅
- 在 Chrome 地址栏右侧会出现安装图标
- 在 Android Chrome 上可通过菜单 → "安装应用"
- 在 iOS Safari 上可通过"分享" → "添加到主屏幕"

## 如果需要更新应用

修改代码后，更新 `sw.js` 中的 `CACHE_NAME` 版本号（如 `v13` → `v14`），确保用户能获取最新版本。

