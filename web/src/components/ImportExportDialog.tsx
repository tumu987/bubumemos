import { timestampDate } from "@bufbuild/protobuf/wkt";
import { AlertTriangleIcon, CheckCircleIcon, DownloadIcon, FileTextIcon, Loader2Icon, UploadIcon, XCircleIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { exportMemosAsJson, exportMemosAsMarkdown, fetchAllMemosForExport } from "@/services/exportService";
import type { ImportResult } from "@/services/importService";
import { checkFileTooLarge, executeImport, generateImportPreview, validateImportData } from "@/services/importService";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

const SelectAllCheckbox = ({
  id,
  checked,
  indeterminate,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  indeterminate: boolean;
  onCheckedChange: () => void;
}) => <Checkbox id={id} checked={indeterminate ? "indeterminate" : checked} onCheckedChange={onCheckedChange} />;

export type ImportExportTab = "export" | "import";
type ExportFormat = "json" | "markdown";
type ImportStep = "select" | "preview" | "importing" | "done";

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: ImportExportTab;
}

const ImportExportDialog = ({ open, onOpenChange, initialTab = "export" }: ImportExportDialogProps) => {
  const [activeTab, setActiveTab] = useState<ImportExportTab>(initialTab);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{activeTab === "export" ? "导出数据" : "导入数据"}</DialogTitle>
          <DialogDescription>
            {activeTab === "export" ? "将 Memos 导出为 JSON 或 Markdown 备份文件。" : "从之前的 JSON 导出文件中恢复数据。"}
          </DialogDescription>
        </DialogHeader>

        {activeTab === "export" ? <ExportTab key="export" /> : <ImportTab key="import" />}
      </DialogContent>
    </Dialog>
  );
};

const ExportTab = () => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const loadMemos = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllMemosForExport()
      .then((all) => {
        setMemos(all);
        setSelected(new Set(all.map((_, i) => i)));
      })
      .catch(() => setError("加载 memo 失败，请重试。"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  const allSelected = memos.length > 0 && selected.size === memos.length;
  const someSelected = selected.size > 0 && selected.size < memos.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(memos.map((_, i) => i)));
    }
  };

  const toggleOne = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);
  };

  const selectedMemos = useMemo(() => memos.filter((_, i) => selected.has(i)), [memos, selected]);

  const doExport = async (format: ExportFormat) => {
    setExportingFormat(format);
    try {
      if (format === "json") {
        await exportMemosAsJson(selectedMemos);
      } else {
        await exportMemosAsMarkdown(selectedMemos);
      }
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadMemos}>
            重试
          </Button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">正在加载 memos...</span>
        </div>
      ) : memos.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">没有可导出的 memo。</div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <SelectAllCheckbox id="select-all" checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleAll} />
            <Label htmlFor="select-all" className="text-sm cursor-pointer">
              {selected.size} / {memos.length} 条已选择
            </Label>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {memos.map((memo, i) => {
              const snippet = memo.content?.slice(0, 120) || "（空白）";
              const dateStr = memo.createTime
                ? timestampDate(memo.createTime).toLocaleString(navigator.language, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
              return (
                <label
                  key={i}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/40",
                    selected.has(i) && "bg-accent/20",
                  )}
                >
                  <Checkbox checked={selected.has(i)} onCheckedChange={() => toggleOne(i)} className="mt-0.5" aria-label={`Select: ${snippet}`} />
                  <div className="min-w-0 text-sm">
                    <div className="truncate text-foreground">{snippet}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateStr && (
                        <span>
                          {dateStr}
                          {" · "}
                        </span>
                      )}
                      {memo.tags?.length > 0 && memo.tags.map((t) => `#${t}`).join(" ")}
                      {memo.tags?.length === 0 && "--"}
                      {" · "}
                      {memo.attachments?.length ?? 0} 个附件
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => doExport("markdown")} disabled={exportingFormat !== null || selected.size === 0}>
              {exportingFormat === "markdown" ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <FileTextIcon className="h-4 w-4" />}
              导出 Markdown
            </Button>
            <Button variant="outline" onClick={() => doExport("json")} disabled={exportingFormat !== null || selected.size === 0}>
              {exportingFormat === "json" ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
              导出 JSON
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

const ImportTab = () => {
  const [step, setStep] = useState<ImportStep>("select");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ memoCount: number; attachmentCount: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importDataCache, setImportDataCache] = useState<unknown>(null);

  const resetImport = useCallback(() => {
    setStep("select");
    setError(null);
    setPreview(null);
    setResult(null);
    setProgress({ current: 0, total: 0 });
    setImportDataCache(null);
  }, []);

  const handleFile = useCallback((selectedFile: File) => {
    setError(null);

    if (checkFileTooLarge(selectedFile)) {
      setError("文件过大。最大支持 512 MB。");
      return;
    }

    if (!selectedFile.name.endsWith(".json")) {
      setError("仅支持导入 JSON 文件（.json）。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const validation = validateImportData(text);

      if (!validation.valid) {
        setError(validation.error);
        return;
      }

      const importPreview = generateImportPreview(validation.data);
      setPreview(importPreview);
      setImportDataCache(validation.data);
      setStep("preview");
    };
    reader.onerror = () => {
      setError("读取文件失败。");
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    if (!importDataCache) return;

    setStep("importing");
    setProgress({ current: 0, total: 0 });

    try {
      const importResult = await executeImport(importDataCache as Parameters<typeof executeImport>[0], (current, total) => {
        setProgress({ current, total });
      });
      setResult(importResult);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("select");
    }
  }, [importDataCache]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === "select" && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="relative flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center transition-colors hover:border-muted-foreground/30 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        >
          <UploadIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">拖拽 JSON 导出文件到此处</p>
          <p className="text-xs text-muted-foreground">或点击此区域选择文件</p>
          <input type="file" accept=".json" onChange={handleFileInputChange} className="absolute inset-0 cursor-pointer opacity-0" />
        </div>
      )}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <h4 className="text-sm font-medium text-foreground">导入预览</h4>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Memo 数量</div>
                <div className="text-lg font-semibold text-foreground">{preview.memoCount}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">附件数量</div>
                <div className="text-lg font-semibold text-foreground">{preview.attachmentCount}</div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">导入前请注意</p>
              <p className="text-xs mt-0.5">
                建议在导入前先导出当前数据作为备份。导入的 memo 将作为新条目创建，失败的条目将被跳过，不影响其他数据。
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={resetImport}>
              取消
            </Button>
            <Button onClick={handleImport}>
              <DownloadIcon className="h-4 w-4" />
              确认导入
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2Icon className="h-6 w-6 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">
            正在导入... {progress.current} / {progress.total}
          </div>
          {progress.total > 0 && (
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <h4 className="text-sm font-medium text-foreground">导入完成</h4>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-emerald-500/10 p-3">
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  成功
                </div>
                <div className="text-lg font-semibold text-foreground">{result.success}</div>
              </div>
              <div className="rounded-md bg-red-500/10 p-3">
                <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <XCircleIcon className="h-3.5 w-3.5" />
                  失败
                </div>
                <div className="text-lg font-semibold text-foreground">{result.failed}</div>
              </div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-border">
              {result.errors.map((err: { index: number; content: string; reason: string }, i: number) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs border-b border-border last:border-b-0">
                  <span className="text-muted-foreground shrink-0">#{err.index + 1}</span>
                  <span className="truncate text-muted-foreground">{err.content || "（空白）"}</span>
                  <span className="text-destructive shrink-0">{err.reason}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={resetImport}>
              完成
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportExportDialog;
