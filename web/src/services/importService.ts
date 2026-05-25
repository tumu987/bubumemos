import { create } from "@bufbuild/protobuf";
import { attachmentServiceClient, memoServiceClient } from "@/connect";
import { base64ToBytes } from "@/utils/base64";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { MemoSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import type { ExportData, MemoExport } from "./exportService";

interface ImportValidation {
  valid: true;
  data: ExportData;
  error?: never;
}

interface ImportValidationError {
  valid: false;
  data?: never;
  error: string;
}

type ImportValidationResult = ImportValidation | ImportValidationError;

interface ImportPreview {
  memoCount: number;
  attachmentCount: number;
}

interface ImportError {
  index: number;
  content: string;
  reason: string;
}

export interface ImportResult {
  success: number;
  skipped: number;
  failed: number;
  errors: ImportError[];
}

const MAX_FILE_SIZE = 512 * 1024 * 1024;

function parseVisibility(value: string): Visibility {
  const num = Number(value);
  if (num >= 1 && num <= 3) return num as Visibility;
  const upper = value?.toUpperCase?.();
  if (upper === "PRIVATE") return Visibility.PRIVATE;
  if (upper === "PROTECTED") return Visibility.PROTECTED;
  if (upper === "PUBLIC") return Visibility.PUBLIC;
  return Visibility.PRIVATE;
}

export function validateImportData(jsonString: string): ImportValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: "JSON 格式无效，无法解析该文件。" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, error: "格式无效：根元素必须是一个对象。" };
  }

  const data = parsed as Record<string, unknown>;

  if (data.version !== 1) {
    return { valid: false, error: `不支持的版本：${String(data.version)}，仅支持版本 1。` };
  }

  if (!Array.isArray(data.memos)) {
    return { valid: false, error: "格式无效：'memos' 必须是一个数组。" };
  }

  for (let i = 0; i < data.memos.length; i++) {
    const memo = data.memos[i] as Record<string, unknown>;
    if (typeof memo.content !== "string") {
      return { valid: false, error: `第 ${i} 条 memo 的 'content' 字段无效或缺失。` };
    }
  }

  return { valid: true, data: data as unknown as ExportData };
}

export function generateImportPreview(data: ExportData): ImportPreview {
  let attachmentCount = 0;
  for (const memo of data.memos) {
    attachmentCount += memo.attachments?.length ?? 0;
  }
  return {
    memoCount: data.memos.length,
    attachmentCount,
  };
}

export async function executeImport(data: ExportData, onProgress?: (current: number, total: number) => void): Promise<ImportResult> {
  const result: ImportResult = { success: 0, skipped: 0, failed: 0, errors: [] };
  const total = data.memos.length;

  for (let i = 0; i < data.memos.length; i++) {
    const memoExport = data.memos[i];
    onProgress?.(i + 1, total);

    try {
      const createdAttachments = await createAttachmentsFromExport(memoExport);

      const visibility = parseVisibility(memoExport.visibility);

      await memoServiceClient.createMemo({
        memo: create(MemoSchema, {
          content: memoExport.content,
          visibility,
          tags: memoExport.tags ?? [],
          pinned: memoExport.pinned ?? false,
          attachments: createdAttachments.map((a) => create(AttachmentSchema, { name: a.name })),
        }),
      });

      result.success++;
    } catch (err) {
      const snippet = (memoExport.content ?? "").slice(0, 80);
      const reason = err instanceof Error ? err.message : "Unknown error";
      result.failed++;
      result.errors.push({ index: i, content: snippet, reason });
    }
  }

  return result;
}

async function createAttachmentsFromExport(memoExport: MemoExport) {
  const created: { name: string }[] = [];

  if (!memoExport.attachments) {
    return created;
  }

  for (const att of memoExport.attachments) {
    try {
      const content = base64ToBytes(att.data);
      const attachment = await attachmentServiceClient.createAttachment({
        attachment: create(AttachmentSchema, {
          filename: att.filename,
          size: BigInt(att.size),
          type: att.type,
          content,
        }),
      });
      created.push({ name: attachment.name });
    } catch (err) {
      console.warn(`Failed to create attachment "${att.filename}" during import:`, err);
    }
  }

  return created;
}

export function checkFileTooLarge(file: File): boolean {
  return file.size > MAX_FILE_SIZE;
}
