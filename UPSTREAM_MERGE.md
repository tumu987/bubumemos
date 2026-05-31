# 上游合并备忘录

向上游 [usememos/memos](https://github.com/usememos/memos) 合并新版本的操作指南。

## 一次性的前置设置

```bash
cd /Users/bubu/Claude项目/bubumemos/memos

# 添加上游远程（只需一次）
git remote add upstream https://github.com/usememos/memos.git
```

## 每次发新版的操作流程

假设上游发布了 `v0.30.0`，你要合进来。

```bash
# 1. 拉取上游
git fetch upstream --tags

# 2. 确认当前状态干净
git status

# 3. 合并上游 tag
git merge v0.30.0
```

## 冲突处理

### 几乎必然冲突的文件

| 文件 | 原因 | 处理方式 |
|------|------|---------|
| `go.mod` | 依赖版本不同 | 两边都要的依赖都保留，`go mod tidy` 清理 |
| `go.sum` | 同上，自动生成 | 冲突完跑 `go mod tidy` 即可 |

### 大概率冲突的文件

| 文件 | 你的改动 | 处理方式 |
|------|---------|---------|
| `server/router/api/v1/v1.go` | 加了 rate limiting 中间件 | 保留你的中间件，套在上游新版路由结构上 |
| `store/memo.go` | `DeleteMemo` 加了事务 | 保留事务包装，里面有上游新逻辑就合进去 |
| `store/driver.go` | 加了 `RunInTransaction` | 你加的在末尾，上游不太可能冲突；有冲突就保留你的 |
| `web/src/components/PreviewImageDialog.tsx` | 整块重写 | 保你的 ZoomableImage，如果上游加了 video/motion 支持也合进来 |

### 大概率不冲突

| 你的新文件 | 说明 |
|-----------|------|
| `web/src/components/PdfPreviewDialog.tsx` | 全新，上游不会碰 |
| `web/src/components/MdPreviewDialog.tsx` | 全新 |
| `web/src/components/MobileNavBar.tsx` | 全新 |
| `web/src/components/PreviewNavButton.tsx` | 全新 |
| `web/src/components/Settings/ImportExportSection.tsx` | 全新 |
| `web/src/services/importService.ts` | 全新 |
| `web/src/services/exportService.ts` | 全新 |
| `web/src/utils/zip.ts` | 全新 |
| `web/src/components/MemoMetadata/Attachment/PdfCard.tsx` | 全新 |
| `web/src/components/MemoMetadata/Attachment/MdCard.tsx` | 全新 |

### 可能回来的删除文件

上游新版可能带回 GitHub Actions workflows（你删过的 8 个文件）。合完如果它们重新出现：

```bash
git rm .github/workflows/backend-tests.yml \
       .github/workflows/build-canary-image.yml \
       .github/workflows/demo-deploy.yml \
       .github/workflows/frontend-tests.yml \
       .github/workflows/proto-linter.yml \
       .github/workflows/release-please.yml \
       .github/workflows/release.yml \
       .github/workflows/stale.yml \
       CODEOWNERS \
       SECURITY.md \
       release-please-config.json \
       .release-please-manifest.json 2>/dev/null
```

你自己的 `.github/workflows/release.yml` 不要删。

## 合完后的验证

```bash
# Go
go build ./...
go vet ./...
go test ./...

# 前端
cd web && pnpm build && cd ..

# 确认没有把匕首捅到自己
git status
```

## 提交和发版

```bash
git add -A
git commit -m "merge: upstream v0.30.0"
git push

# 打新版本 tag
git tag -a v0.1.3 -m "bubumemos v0.1.3 — based on memos v0.30.0"
git push origin v0.1.3
```

tag 推送后 GitHub Actions 自动创建 Release 和 Docker 镜像。

## 如果冲突太多搞不定

```bash
# 放弃合并
git merge --abort

# 开个分支慢慢搞
git checkout -b merge-v0.30.0
git merge v0.30.0
# ... 慢慢解决冲突 ...
git checkout main
git merge merge-v0.30.0
```

## 绝对不要做的

- ❌ 改 `go.mod` 里的 `module github.com/usememos/memos` — 维持不变
- ❌ `git push --force` — 除非你完全确定自己在干什么
- ❌ 改上游 `proto/` 目录下的 `.proto` 文件 — 那是接口定义
