/**
 * 导入服务：解析、验证、预览、执行导入。
 * 查重键 content|createTime，附件增量更新。
 */
import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import type { ExportData, MemoExport } from "./exportService";

// ============================================================================
// Types
// ============================================================================

export interface ParsedImport {
  data: ExportData;
  attachmentFiles: Map<string, Uint8Array>;
}

interface MemoToUpdate {
  export: MemoExport;
  existingMemoName: string;
  newAttachmentNames: string[];
  existingAttachments: { name: string; filename: string }[];
}

export interface ImportPreview {
  newMemos: MemoExport[];
  updateMemos: MemoToUpdate[];
  skippedCount: number;
  newAttachments: number;
  updateAttachments: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  attachmentsCreated: number;
  attachmentsUpdated: number;
  attachmentsFailed: number;
  errors: { memo: string; error: string }[];
}

// ============================================================================
// Parse
// ============================================================================

export async function parseImportFile(file: File): Promise<ParsedImport> {
  const attachmentFiles = new Map<string, Uint8Array>();

  if (file.name.endsWith(".zip")) return parseZipFile(file, attachmentFiles);
  if (file.name.endsWith(".json")) {
    const text = await file.text();
    return { data: JSON.parse(text) as ExportData, attachmentFiles };
  }
  throw new Error(`Unsupported file type: ${file.name}. Please upload a .zip or .json file.`);
}

async function parseZipFile(file: File, attachmentFiles: Map<string, Uint8Array>): Promise<ParsedImport> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const eocdOffset = findEocd(buffer);
  if (eocdOffset < 0) throw new Error("Invalid ZIP file: end of central directory not found");

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  let dataJson: ExportData | null = null;

  for (let i = 0; i < totalEntries; i++) {
    const signature = view.getUint32(cdOffset, true);
    if (signature !== 0x02014b50) throw new Error("Invalid central directory entry");

    const nameLen = view.getUint16(cdOffset + 28, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const nameBytes = buffer.slice(cdOffset + 46, cdOffset + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);

    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    // Use central directory size (handles data descriptor flag where local header size is 0)
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const data = buffer.slice(dataStart, dataStart + compressedSize);

    if (name === "data.json") dataJson = JSON.parse(new TextDecoder().decode(data)) as ExportData;
    else if (name.startsWith("attachments/")) attachmentFiles.set(name, data);

    // Advance past extra field and file comment in central directory entry
    const cdExtraLen = view.getUint16(cdOffset + 30, true);
    const cdCommentLen = view.getUint16(cdOffset + 32, true);
    cdOffset += 46 + nameLen + cdExtraLen + cdCommentLen;
  }

  if (!dataJson) throw new Error("ZIP file does not contain data.json");
  return { data: dataJson, attachmentFiles };
}

function findEocd(buffer: Uint8Array): number {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) return i;
  }
  return -1;
}

// ============================================================================
// Validate
// ============================================================================

// ============================================================================
// Preview
// ============================================================================

/** 返回导入附件的增量列表（不在现有附件中的） */
function getNewAttachments(importAtts: MemoExport["attachments"], existingAtts: { filename: string }[]): MemoExport["attachments"] {
  const existingFilenames = new Set(existingAtts.map((a) => a.filename));
  return (importAtts ?? []).filter((a) => !existingFilenames.has(a.name));
}

export function generateImportPreview(data: ExportData, existingMemos: Memo[], currentUserName: string): ImportPreview {
  const myMemos = existingMemos.filter((m) => m.creator === currentUserName);

  // Dedup key: content | createTime (no attachments)
  const existingByKey = new Map(
    myMemos.map((m) => [`${m.content}|${m.createTime ? timestampDate(m.createTime).toISOString() : ""}`, m]),
  );

  const newMemos: MemoExport[] = [];
  const updateMemos: MemoToUpdate[] = [];
  let skippedCount = 0;
  let newAttachments = 0;
  let updateAttachments = 0;

  for (const memo of data.memos) {
    const key = `${memo.content}|${memo.createTime}`;
    const attCount = memo.attachments?.length ?? 0;
    const existing = existingByKey.get(key);

    if (!existing) {
      newMemos.push(memo);
      newAttachments += attCount;
    } else {
      const newAtts = getNewAttachments(memo.attachments ?? [], existing.attachments ?? []);
      if (newAtts.length > 0) {
        updateMemos.push({
          export: memo,
          existingMemoName: existing.name,
          newAttachmentNames: newAtts.map((a) => a.name),
          existingAttachments: (existing.attachments ?? []).map((a) => ({ name: a.name, filename: a.filename })),
        });
        updateAttachments += newAtts.length;
      } else {
        skippedCount++;
      }
    }
  }

  return { newMemos, updateMemos, skippedCount, newAttachments, updateAttachments };
}

// ============================================================================
// Helpers
// ============================================================================

export function getAttachmentData(attachmentFiles: Map<string, Uint8Array>, path: string): Uint8Array | null {
  return attachmentFiles.get(path) ?? null;
}

export function parseVisibility(visibility: string): Visibility {
  switch (visibility) {
    case "PUBLIC": return Visibility.PUBLIC;
    case "PROTECTED": return Visibility.PROTECTED;
    case "PRIVATE": return Visibility.PRIVATE;
    default: return Visibility.PRIVATE;
  }
}
