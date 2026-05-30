import { create } from "@bufbuild/protobuf";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { DownloadIcon, FileIcon, InfoIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attachmentServiceClient, memoServiceClient } from "@/connect";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemos } from "@/hooks/useMemoQueries";
import { getAccessToken } from "@/auth-state";
import { cn } from "@/lib/utils";
import type { ExportData, MemoExport } from "@/services/exportService";
import {
  generateImportPreview,
  getAttachmentData,
  type ImportPreview,
  type ImportResult,
  type ParsedImport,
  parseImportFile,
  parseVisibility,
} from "@/services/importService";
import { CreateAttachmentRequestSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { State } from "@/types/proto/api/v1/common_pb";
import { CreateMemoRequestSchema, MemoSchema } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { createZip } from "@/utils/zip";
import SettingGroup from "./SettingGroup";
import SettingRow from "./SettingRow";
import SettingSection from "./SettingSection";

// ============================================================================
// Types
// ============================================================================

type ImportStep = "idle" | "preview" | "importing" | "done";

type ExportFormat = "json" | "markdown";

// ============================================================================
// Utility
// ============================================================================

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// ============================================================================
// Components
// ============================================================================

const ImportExportSection = () => {
  const t = useTranslate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const currentUser = useCurrentUser();

  // --- Import state ---
  const [importStep, setImportStep] = useState<ImportStep>("idle");
  const [parsedImport, setParsedImport] = useState<ParsedImport | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  // --- Export state ---
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [exportState, setExportState] = useState<"idle" | "loading">("idle");
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [untaggedSelected, setUntaggedSelected] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedMemos, setSelectedMemos] = useState<Set<string>>(new Set());
  const [exportError, setExportError] = useState<string | null>(null);

  // --- Fetch data ---
  const memoList = useMemos({ pageSize: 1000 });
  const memos = useMemo(() => {
    const data = memoList.data?.memos ?? [];
    // Known Bug#13: Only current user's memos
    return data.filter((m) => m.creator === currentUser?.name);
  }, [memoList.data, currentUser]);

  // Auto-scroll when preview or result appears
  useEffect(() => {
    if (importStep === "preview") previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (importStep === "done") resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [importStep]);

  // All tags from memos
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const memo of memos) {
      for (const tag of memo.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [memos]);

  // Filtered memos for export
  const filteredMemos = useMemo(() => {
    return memos.filter((memo) => {
      // Tag filter: 无标签 和 标签pill 可以组合使用，满足任一即可
      const memoTags = memo.tags ?? [];
      const hasAnyTagFilter = tagFilter.size > 0 || untaggedSelected;
      if (hasAnyTagFilter) {
        const matchUntagged = untaggedSelected && memoTags.length === 0;
        const matchTag = tagFilter.size > 0 && memoTags.some((tag) => tagFilter.has(tag));
        if (!matchUntagged && !matchTag) return false;
      }

      // Date filter
      const createTime = memo.createTime ? timestampDate(memo.createTime) : null;
      if (dateFrom && createTime) {
        if (createTime < new Date(dateFrom + "T00:00:00")) return false;
      }
      if (dateTo && createTime) {
        if (createTime > new Date(dateTo + "T23:59:59")) return false;
      }

      return true;
    });
  }, [memos, tagFilter, untaggedSelected, dateFrom, dateTo]);

  // Select all logic
  const allFilteredSelected = filteredMemos.length > 0 && filteredMemos.every((m) => selectedMemos.has(m.name));
  const selectedCount = filteredMemos.filter((m) => selectedMemos.has(m.name)).length;

  // ==========================================================================
  // Import handlers
  // ==========================================================================

  const handleFileSelected = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        const parsed = await parseImportFile(file);
        setParsedImport(parsed);
        const preview = generateImportPreview(parsed.data, memos, currentUser?.name ?? "");
        setImportPreview(preview);
        setImportStep("preview");
      } catch (e) {
        setImportError(e instanceof Error ? e.message : "Failed to parse file");
      }
    },
    [memos, currentUser],
  );

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview || !parsedImport) return;
    setImportStep("importing");
    setImportProgress(0);

    const result: ImportResult = {
      created: 0, updated: 0, skipped: importPreview.skippedCount, failed: 0,
      attachmentsCreated: 0, attachmentsUpdated: 0, attachmentsFailed: 0,
      errors: [],
    };
    const total = importPreview.newMemos.length + importPreview.updateMemos.length;

    // 上传单个附件，失败返回 null
    const uploadOne = async (att: { path: string; name: string }): Promise<{ name: string } | null> => {
      const data = getAttachmentData(parsedImport.attachmentFiles, att.path);
      if (!data) return null;
      const resp = await attachmentServiceClient.createAttachment(
        create(CreateAttachmentRequestSchema, {
          attachment: { filename: att.name, content: data, type: "", name: "" },
          attachmentId: "",
        }),
      );
      return resp.name ? { name: resp.name } : null;
    };

    // 批量并发上传附件，返回成功 ref 列表，同时累加计数器
    const uploadMany = async (atts: { path: string; name: string }[], counter: "attachmentsCreated" | "attachmentsUpdated") => {
      const results = await Promise.all(atts.map((a) => uploadOne(a).catch(() => null)));
      const refs: { name: string }[] = [];
      for (const r of results) {
        if (r) { refs.push(r); result[counter]++; }
        else result.attachmentsFailed++;
      }
      return refs;
    };

    let completed = 0;
    const recordError = (content: string, e: unknown) => {
      result.failed++;
      result.errors.push({ memo: content.slice(0, 50), error: e instanceof Error ? e.message : "Unknown error" });
    };

    // 新建 memo
    for (let i = 0; i < importPreview.newMemos.length; i++) {
      const me = importPreview.newMemos[i];
      try {
        const refs = await uploadMany(me.attachments ?? [], "attachmentsCreated");
        const ts = me.createTime ? timestampFromDate(new Date(me.createTime)) : undefined;
        await memoServiceClient.createMemo(create(CreateMemoRequestSchema, {
          memo: { content: me.content, visibility: parseVisibility(me.visibility), tags: me.tags ?? [],
            pinned: me.pinned ?? false, createTime: ts, state: State.NORMAL,
            creator: currentUser?.name ?? "", name: "", attachments: refs },
          memoId: "",
        }));
        result.created++;
      } catch (e) { recordError(me.content, e); }
      completed++;
      setImportProgress(Math.round((completed / total) * 100));
    }

    // 更新已有 memo（只追加增量附件）
    for (let i = 0; i < importPreview.updateMemos.length; i++) {
      const { export: me, existingMemoName, newAttachmentNames, existingAttachments } = importPreview.updateMemos[i];
      try {
        const newOnly = (me.attachments ?? []).filter((a) => newAttachmentNames.includes(a.name));
        const newRefs = await uploadMany(newOnly, "attachmentsUpdated");
        const newRefMap = new Map(newRefs.map((r, j) => [newOnly[j].name, r]));
        const existingByFilename = new Map(existingAttachments.map((a) => [a.filename, a]));
        const ordered = (me.attachments ?? []).map((a) => existingByFilename.get(a.name) ?? newRefMap.get(a.name) ?? { name: a.name });
        await memoServiceClient.updateMemo({
          memo: create(MemoSchema, { name: existingMemoName, attachments: ordered }),
          updateMask: { paths: ["attachments"] },
        });
        result.updated++;
      } catch (e) { recordError(me.content, e); }
      completed++;
      setImportProgress(Math.round((completed / total) * 100));
    }

    setImportResult(result);
    setImportStep("done");
  }, [importPreview, parsedImport, currentUser]);

  const handleResetImport = useCallback(() => {
    setImportStep("idle");
    setParsedImport(null);
    setImportPreview(null);
    setImportResult(null);
    setImportProgress(0);
    setImportError(null);
  }, []);

  // ==========================================================================
  // Export handlers
  // ==========================================================================

  const handleExport = useCallback(async () => {
    setExportState("loading");
    setExportError(null);
    try {
      const memosToExport = allFilteredSelected ? filteredMemos : filteredMemos.filter((m) => selectedMemos.has(m.name));
      if (memosToExport.length === 0) {
        setExportError("No memos selected");
        setExportState("idle");
        return;
      }

      const dateStr = formatDateStr(new Date());
      const entries: { name: string; data: Uint8Array }[] = [];

      if (exportFormat === "json") {
        const exportData: ExportData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          memos: [],
        };

        const attachmentEntries: { name: string; data: Uint8Array }[] = [];
        const usedNames = new Set<string>();

        for (const memo of memosToExport) {
          const memoAtts: MemoExport["attachments"] = [];

          // Deduplicate file names first
          const attDownloads: { att: typeof memo.attachments[0]; fileName: string }[] = [];
          for (const att of memo.attachments ?? []) {
            let fileName = att.filename;
            let counter = 1;
            while (usedNames.has(fileName)) {
              const dotIndex = att.filename.lastIndexOf(".");
              const base = dotIndex >= 0 ? att.filename.slice(0, dotIndex) : att.filename;
              const ext = dotIndex >= 0 ? att.filename.slice(dotIndex) : "";
              fileName = `${base}_${counter}${ext}`;
              counter++;
            }
            usedNames.add(fileName);
            attDownloads.push({ att, fileName });
          }

          // Known Bug#12: concurrent fetch all attachments
          const results = await Promise.all(
            attDownloads.map(async ({ att, fileName }) => {
              try {
                const url = getAttachmentUrl(att);
                if (!url) return null;
                const token = getAccessToken();
                const headers: Record<string, string> = {};
                if (token) headers["Authorization"] = `Bearer ${token}`;
                const response = await fetch(url, { headers });
                const blob = await response.blob();
                const data = new Uint8Array(await blob.arrayBuffer());
                return { fileName, data };
              } catch {
                return null;
              }
            }),
          );

          for (const r of results) {
            if (!r) continue;
            attachmentEntries.push({ name: `attachments/${r.fileName}`, data: r.data });
            memoAtts.push({ path: `attachments/${r.fileName}`, name: r.fileName });
          }

          const createTime = memo.createTime ? timestampDate(memo.createTime).toISOString() : new Date().toISOString();

          exportData.memos.push({
            content: memo.content,
            visibility: memo.visibility === 3 ? "PUBLIC" : memo.visibility === 2 ? "PROTECTED" : "PRIVATE",
            tags: memo.tags ?? [],
            pinned: memo.pinned ?? false,
            createTime,
            attachments: memoAtts,
          });
        }

        const jsonBytes = new TextEncoder().encode(JSON.stringify(exportData, null, 2));
        entries.push({ name: "data.json", data: jsonBytes });
        entries.push(...attachmentEntries);
      } else {
        // Markdown format
        let mdContent = "";
        for (const memo of memosToExport) {
          const tags = (memo.tags ?? []).join(", ");
          const createTime = memo.createTime ? timestampDate(memo.createTime).toISOString() : "";
          const attNames = (memo.attachments ?? []).map((a) => a.filename).join(", ");

          mdContent += `Tags: ${tags}\n`;
          mdContent += `Date: ${createTime}\n`;
          mdContent += `Attachments: ${attNames}\n\n`;
          mdContent += `${memo.content}\n\n---\n\n`;
        }
        const mdBytes = new TextEncoder().encode(mdContent);
        entries.push({ name: "memos.md", data: mdBytes });
      }

      // Known Bug#9: trigger download after all awaits complete
      const blob = await createZip(entries);
      // Known Bug#8: avoid hyphens in filename for macOS
      const fileName = `memos_export_${dateStr}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportState("idle");
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
      setExportState("idle");
    }
  }, [allFilteredSelected, filteredMemos, selectedMemos, exportFormat, currentUser]);

  const toggleTag = useCallback((tag: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    if (!tagFilter.has(tag)) setUntaggedSelected(false);
  }, [tagFilter]);

  const clearTagFilter = useCallback(() => {
    setTagFilter(new Set());
    setUntaggedSelected(false);
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedMemos(allFilteredSelected ? new Set() : new Set(filteredMemos.map((m) => m.name)));
  }, [allFilteredSelected, filteredMemos]);

  const toggleMemoSelection = useCallback((name: string) => {
    setSelectedMemos((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <SettingSection title={t("setting.import-export.label")}>
      {/* Export */}
      <SettingGroup title="导出数据">
        {/* Format selector */}
        <SettingRow label="导出格式" vertical>
          <div className="flex w-full flex-col gap-2 px-3 py-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="export-format"
                checked={exportFormat === "json"}
                onChange={() => setExportFormat("json")}
                className="shrink-0"
              />
              <div>
                <span className="text-sm font-medium text-foreground">JSON (含附件)</span>
                <span className="ml-2 text-xs font-normal leading-5 text-muted-foreground">导出完整数据和附件为 ZIP 包</span>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="export-format"
                checked={exportFormat === "markdown"}
                onChange={() => setExportFormat("markdown")}
                className="shrink-0"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Markdown (纯文本)</span>
                <span className="ml-2 text-xs font-normal leading-5 text-muted-foreground">仅导出内容，不含附件</span>
              </div>
            </label>
          </div>
        </SettingRow>

        {/* Tag filter */}
        <SettingRow label="筛选条件" vertical>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">标签</span>
              <button
                type="button"
                onClick={() => { setUntaggedSelected((prev) => !prev); setTagFilter(new Set()); }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  untaggedSelected
                    ? "border-solid border-amber-500/50 bg-amber-500/10 text-amber-600"
                    : "border-dashed border-muted-foreground/50 text-muted-foreground hover:border-amber-500/30 hover:border-solid",
                )}
              >
                无标签
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors",
                    tagFilter.has(tag)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30",
                  )}
                >
                  {tag}
                </button>
              ))}
              <button
                type="button"
                onClick={clearTagFilter}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
                  tagFilter.size === 0 && !untaggedSelected && "invisible",
                )}
              >
                清除
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">时间</span>
              {/* Known Bug#14: Use native date input for Safari/Firefox/Chrome compatibility */}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs"
              />
              <span className="text-xs text-muted-foreground">至</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
                  !dateFrom && !dateTo && "invisible",
                )}
              >
                清除
              </button>
            </div>
          </div>
        </SettingRow>

        {/* Memo selection */}
        <SettingRow label="选择备忘录" className="w-full" vertical>
          <div className="flex w-full flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="rounded" />
                <span className="text-sm text-foreground">全选</span>
              </label>
              <span className="text-xs text-muted-foreground">
                已选 {selectedCount} / {filteredMemos.length}
              </span>
            </div>

            {filteredMemos.length === 0 ? (
              <div className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8">
                <FileIcon className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">无匹配的备忘录</div>
              </div>
            ) : (
              <div className="w-full max-h-96 overflow-y-auto rounded-lg border border-border">
                {filteredMemos.map((memo) => {
                  const createTime = memo.createTime ? timestampDate(memo.createTime) : null;
                  const dateLabel = createTime ? createTime.toLocaleDateString() : "";
                  const preview = memo.content.slice(0, 80);
                  return (
                    <label
                      key={memo.name}
                      className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 border-b border-border last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMemos.has(memo.name)}
                        onChange={() => toggleMemoSelection(memo.name)}
                        className="mt-0.5 rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{dateLabel}</span>
                          {memo.pinned && <span className="text-[10px] text-amber-500">置顶</span>}
                        </div>
                        <div className="truncate text-sm text-foreground">{preview || "(空)"}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </SettingRow>

        {/* Export button */}
        <div className="flex w-full justify-end px-3 py-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exportState === "loading" || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <DownloadIcon className="h-4 w-4" />
            {exportState === "loading" ? "导出中..." : `导出 (${selectedCount})`}
          </button>
        </div>

        {exportError && <div className="px-3 pb-3 text-sm text-destructive">{exportError}</div>}
      </SettingGroup>
      <SettingGroup title="导入数据" showSeparator>
        {importStep === "idle" && (
          <SettingRow label="选择文件" vertical>
            <div
              className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-muted-foreground/30"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelected(file);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">点击或拖拽 .zip / .json 文件到此处</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
              />
            </div>
          </SettingRow>
        )}

        {importStep === "preview" && importPreview && (
          <SettingRow label="预览" vertical>
            <div ref={previewRef} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                  <div className="text-lg font-semibold text-green-600">{importPreview.newMemos.length}</div>
                  <div className="text-xs text-muted-foreground">新备忘录</div>
                  <div className="text-xs text-muted-foreground">{importPreview.newAttachments} 个附件</div>
                </div>
                <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                  <div className="text-lg font-semibold text-amber-600">{importPreview.updateMemos.length}</div>
                  <div className="text-xs text-muted-foreground">已存在(将更新)</div>
                  <div className="text-xs text-muted-foreground">+{importPreview.updateAttachments} 个附件</div>
                </div>
              </div>
              {importPreview.newMemos.length + importPreview.updateMemos.length === 0 ? (
                <div className="flex items-center gap-8 rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <InfoIcon className="h-4 w-4 shrink-0" />
                    <span>{importPreview.skippedCount} 条备忘录均已存在，无需导入</span>
                  </div>
                  <button type="button" onClick={handleResetImport} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                    退出
                  </button>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={handleResetImport} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
                    取消
                  </button>
                  <button type="button" onClick={handleConfirmImport} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                    确认导入 ({importPreview.newMemos.length + importPreview.updateMemos.length})
                  </button>
                </div>
              )}
            </div>
          </SettingRow>
        )}

        {importStep === "importing" && (
          <SettingRow label="导入中" vertical>
            <div className="flex flex-col gap-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${importProgress}%` }} />
              </div>
              <div className="text-center text-xs text-muted-foreground">{importProgress}%</div>
            </div>
          </SettingRow>
        )}

        {importStep === "done" && importResult && (
          <SettingRow label="完成" vertical>
            <div ref={resultRef} className="flex flex-col gap-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                  <div className="text-lg font-semibold text-green-600">{importResult.created}</div>
                  <div className="text-xs text-muted-foreground">新建</div>
                </div>
                <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                  <div className="text-lg font-semibold text-amber-600">{importResult.updated}</div>
                  <div className="text-xs text-muted-foreground">更新</div>
                </div>
                <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                  <div className="text-lg font-semibold text-muted-foreground">{importResult.skipped}</div>
                  <div className="text-xs text-muted-foreground">跳过</div>
                </div>
                <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                  <div className="text-lg font-semibold text-red-600">{importResult.failed}</div>
                  <div className="text-xs text-muted-foreground">失败</div>
                </div>
              </div>
              {(importResult.attachmentsCreated > 0 || importResult.attachmentsUpdated > 0 || importResult.attachmentsFailed > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                    <div className="text-lg font-semibold text-green-600">{importResult.attachmentsCreated + importResult.attachmentsUpdated}</div>
                    <div className="text-xs text-muted-foreground">附件成功</div>
                  </div>
                  <div className="rounded-lg border border-border bg-card px-2 py-1 text-center">
                    <div className="text-lg font-semibold text-red-600">{importResult.attachmentsFailed}</div>
                    <div className="text-xs text-muted-foreground">附件失败</div>
                  </div>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="text-xs text-muted-foreground py-0.5">
                      <span className="font-medium text-destructive">Failed:</span> {err.memo} — {err.error}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleResetImport}
                  className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  完成
                </button>
              </div>
            </div>
          </SettingRow>
        )}

        {importError && (
          <SettingRow label="错误" vertical>
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{importError}</div>
          </SettingRow>
        )}
      </SettingGroup>
    </SettingSection>
  );
};

export default ImportExportSection;
