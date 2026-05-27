import { DownloadIcon, UploadIcon } from "lucide-react";
import { useCallback, useState } from "react";
import ImportExportDialog, { type ImportExportTab } from "@/components/ImportExportDialog";
import { Button } from "@/components/ui/button";
import SettingGroup from "./SettingGroup";
import SettingSection from "./SettingSection";

const ImportExportSection = () => {
  const [dialogState, setDialogState] = useState<{ open: boolean; tab: ImportExportTab }>({ open: false, tab: "export" });

  const openExport = useCallback(() => setDialogState({ open: true, tab: "export" }), []);
  const openImport = useCallback(() => setDialogState({ open: true, tab: "import" }), []);
  const closeDialog = useCallback(() => setDialogState((s) => ({ ...s, open: false })), []);

  return (
    <>
      <SettingSection title="数据导入 / 导出">
        <SettingGroup
          title="备份与恢复"
          description="将 Memos 导出为 JSON 文件（含附件）用于备份，或导出为 Markdown 获得可读格式。也可导入之前导出的 JSON 文件来恢复数据。"
        >
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">管理你的数据</div>
              <div className="text-xs text-muted-foreground">导出为 JSON 或 Markdown，或从之前的导出中导入。</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={openExport} size="sm" variant="outline">
                <DownloadIcon className="h-4 w-4" />
                导出
              </Button>
              <Button onClick={openImport} size="sm" variant="outline">
                <UploadIcon className="h-4 w-4" />
                导入
              </Button>
            </div>
          </div>
        </SettingGroup>
      </SettingSection>

      <ImportExportDialog open={dialogState.open} onOpenChange={closeDialog} initialTab={dialogState.tab} />
    </>
  );
};

export default ImportExportSection;
