# 将本应用部署到 GitHub Pages

项目已配置 **Vite `base`**（在 GitHub Actions 构建时根据仓库名自动设为 `/仓库名/`）和 **GitHub Actions** 自动发布到 Pages。按下面步骤操作即可。

## 前置说明

- **访问地址**（项目站点，最常见）：`https://<你的用户名>.github.io/<仓库名>/`
- 例如仓库为 `json_map_view`，则站点为 `https://<user>.github.io/json_map_view/`
- 若仓库名为 `json-map-view`，路径中的仓库名需与 GitHub 上**完全一致**（含大小写）；工作流里的 `GITHUB_REPOSITORY` 会由 GitHub 自动注入，一般无需改代码。

## 一、在 GitHub 上创建仓库并推送代码

1. 登录 [GitHub](https://github.com)，新建一个 **Repository**（可设为 Public；私有仓库的 Pages 视你的账号/组织方案而定）。
2. **不要**勾选自动添加 README（若本地已有完整项目，避免冲突）；若已初始化，按 GitHub 提示合并即可。
3. 在本地项目目录执行（将 URL 换成你的仓库地址）：

```bash
cd /path/to/json_map_view
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

若你的默认分支是 `master`，工作流已同时监听 `main` 与 `master`，推送任一分支均可触发部署。

## 二、启用 GitHub Pages（必须做一次）

1. 打开 GitHub 上该仓库页面。
2. 进入 **Settings** → 左侧 **Pages**。
3. 在 **Build and deployment** → **Source** 中，选择 **GitHub Actions**（不要选 “Deploy from a branch” 的旧方式，除非你想自己维护 `gh-pages` 分支）。
4. 保存后返回仓库 **Actions** 页，确认工作流 **Deploy to GitHub Pages** 有运行权限（首次可能需要你点一次批准）。

## 三、触发构建与部署

- 向 `main` 或 `master` **push** 代码时会自动执行：
  - `npm ci` → `npm run build` → 上传 `dist/` → 发布到 Pages。
- 也可在 **Actions** → **Deploy to GitHub Pages** → **Run workflow** 手动运行。

首次部署成功后，在 **Settings → Pages** 里会显示站点 URL（约 `https://<user>.github.io/<repo>/`）。若暂时 404，等待 1～3 分钟再刷新。

## 四、本地构建说明（可选）

- 本地开发：`npm run dev`，仍为根路径 `/`，不受影响。
- 本地模拟 GitHub 的带前缀构建（用于排查路径问题）：

```bash
GITHUB_REPOSITORY=你的用户名/你的仓库名 npm run build
npm run preview
```

预览时打开终端里提示的地址，检查资源是否从 `/仓库名/` 加载。

## 五、常见问题

1. **页面空白、控制台 404（JS/CSS）**  
   多为 `base` 与仓库名不一致。请用 **GitHub Actions 在线构建**，不要直接把本地 `npm run build`（未设置 `GITHUB_REPOSITORY`）的产物上传到 Pages。

2. **Actions 报错权限**  
   在仓库 **Settings → Actions → General** 中，将 **Workflow permissions** 设为允许读写（或按 GitHub 文档勾选 Pages 部署所需权限）。

3. **用户/组织站点 `username.github.io` 根域名**  
   若将来把站点挂在**用户主页仓库**（仓库名等于 `<username>.github.io`），根路径应为 `/`，需单独把 `vite.config.ts` 里的 `base` 改为 `/` 并调整工作流；当前配置针对 **项目仓库子路径**，与根域名站点不同。

4. **私有仓库**  
   GitHub Pages 对私有仓库的支持取决于你的计划；若不可用，可改用其它静态托管或改为公开仓库。

完成以上步骤后，每次推送到 `main`/`master` 都会自动更新线上站点。
