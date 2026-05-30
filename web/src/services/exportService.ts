/**
 * 导入导出功能的类型定义。
 * 仅保留类型/接口，实际导出逻辑在 ImportExportSection.tsx 中直接调用 createZip。
 */
export interface MemoExport {
  content: string;
  visibility: string;
  tags: string[];
  pinned: boolean;
  createTime: string;
  attachments: { path: string; name: string }[];
}

export interface ExportData {
  version: number;
  exportedAt: string;
  memos: MemoExport[];
}
