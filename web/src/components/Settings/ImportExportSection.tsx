import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import ImportExportDialog from "@/components/ImportExportDialog";
import { Button } from "@/components/ui/button";
import SettingGroup from "./SettingGroup";
import SettingSection from "./SettingSection";

const ImportExportSection = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

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
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <DownloadIcon className="h-4 w-4" />
              打开导入 / 导出
            </Button>
          </div>
        </SettingGroup>
      </SettingSection>

      <ImportExportDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};

export default ImportExportSection;
