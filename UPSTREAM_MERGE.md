# 上游合并备忘录

向上游 [usememos/memos](https://github.com/usememos/memos) 合并新版本的操作指南。基于 2026-05-31 实际合并 v0.29.1 的经验编写。

## 项目模式

bubumemos 是 memos 的 **fork + 定制修改 + 持续合并上游** 模式。

- 模块路径保持 `github.com/usememos/memos`（不改，才能 `git merge` 上游）
- 定制代码直接改在 main 分支，不另开独立分支
- 上游发新版时 `git merge upstream/main`，拿全所有修复+功能
- 冲突集中在 3 个文件：`v1.go`、`PreviewImageDialog.tsx`、`AttachmentListView.tsx`

为什么不用其他方案：
- memos 是服务端二进制，不是库，没法当 Go 依赖引入
- 没有插件系统，开发一个工作量远超定制本身
- cherry-pick 容易漏 bug 修复，维护成本高

## 前置设置（只需一次）

```bash
cd /Users/bubu/Claude项目/bubumemos/memos
git remote add upstream https://github.com/usememos/memos.git
git config rerere.enabled true   # Git 记住冲突解决方式，下次自动处理
```

## 合并流程

```bash
# 1. 看看有什么新的
git fetch upstream --tags && git fetch upstream main
git log v0.29.1..upstream/main --oneline   # 上次合并点之后的新提交

# 2. 合并（直接用 main，包含 tagged release + untagged fixes）
git merge upstream/main

# 3. 解决冲突（见下方）

# 4. 清理残留
go build ./...          # 必有 unused import，修掉
grep -rn "<<< HEAD" .   # 确保没遗留冲突标记
rm -f .release-please-manifest.json release-please-config.json CODEOWNERS SECURITY.md

# 5. 验证
go build ./... && go vet ./...
cd web && pnpm build && cd ..

# 6. 提交
git add -A
git commit -m "merge: upstream vX.Y.Z"
git push
```

## 冲突处理策略

### 必冲突文件

| 文件 | 我们的改动 | 处理方法 |
|------|-----------|---------|
| `v1.go` | rate limiting 中间件 | 保留限流，去掉我们内联的 CORS（上游移到了 `server/cors.go`）|
| `PreviewImageDialog.tsx` | 整块重构 | 直接 `git checkout --ours`，再评估上游新功能是否值得手动加 |
| `AttachmentListView.tsx` | 视频 playsInline 改造 | `git checkout --ours`，用 `VideoPoster` 替换拼贴视图的 `<video>`，单视频不变 |

### 大文件简单策略

`PreviewImageDialog.tsx` 和 `AttachmentListView.tsx` 改动太大，合并必然炸：

```bash
git checkout --ours path/to/file.tsx   # 保我们的版本
# 然后看上游 diff 有什么值得手动加的
git diff ...upstream/main -- path/to/file.tsx
```

### 肯定不冲突的

我们新建的文件（`PdfPreviewDialog.tsx`、`ImportExportSection.tsx`、`zip.ts` 等）上游不会碰，零冲突。

### 会回来的删除文件

上游可能把删过的文件带回来。合完检查：

```bash
ls .release-please-manifest.json release-please-config.json CODEOWNERS SECURITY.md 2>/dev/null && echo "删掉它们"
rm -f .release-please-manifest.json release-please-config.json CODEOWNERS SECURITY.md
```

你的 `.github/workflows/release.yml` 不要动。

## 合完后的清理

```bash
go build ./...          # 报 unused import 就修，通常 v1.go 的 "net/url" 和 "middleware"
grep -rn "<<<<<<< HEAD" .   # 确保没残留冲突标记
```

## 发版

```bash
# 改 internal/version/version.go 的 Version
# git add -A && git commit -m "chore: bump version to X.Y.Z"
git push
git tag vX.Y.Z && git push origin vX.Y.Z
```

tag 推送后 GitHub Actions 自动创建 Release + Docker 镜像。

## 救命按钮

```bash
git merge --abort    # 放弃合并，回到合并前
```

## 禁止事项

- ❌ 改 `go.mod` 的 `module github.com/usememos/members` — 维持不变
- ❌ `git push --force` 到 main — 除非非常确定
- ❌ 改 `proto/` 下的 `.proto` 文件
