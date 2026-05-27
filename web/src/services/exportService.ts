import { timestampDate } from "@bufbuild/protobuf/wkt";
import { memoServiceClient } from "@/connect";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { base64ToBytes, bytesToBase64 } from "@/utils/base64";
import { createZip, type ZipEntry } from "@/utils/zip";

const EXPORT_VERSION = 1;

interface AttachmentExport {
  filename: string;
  type: string;
  size: number;
  data: string;
}

interface MemoExport {
  content: string;
  visibility: string;
  tags: string[];
  pinned: boolean;
  createTime?: string;
  updateTime?: string;
  location?: { placeholder: string; latitude: number; longitude: number };
  attachments: AttachmentExport[];
}

interface ExportData {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  memos: MemoExport[];
}

async function fetchAllMemos(): Promise<Memo[]> {
  const allMemos: Memo[] = [];
  let pageToken = "";

  while (true) {
    const response = await memoServiceClient.listMemos({
      pageSize: 100,
      pageToken: pageToken || undefined,
      state: undefined,
      showDeleted: false,
    });

    allMemos.push(...response.memos);
    pageToken = response.nextPageToken || "";

    if (!pageToken) {
      break;
    }
  }

  return allMemos;
}

async function fetchAttachmentBase64(attachment: Attachment): Promise<string> {
  const url = getAttachmentUrl(attachment);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch attachment: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

async function buildExportData(memos: Memo[]): Promise<ExportData> {
  const memoExports: MemoExport[] = [];

  for (const memo of memos) {
    const attachmentExports: AttachmentExport[] = [];

    for (const attachment of memo.attachments) {
      try {
        const data = await fetchAttachmentBase64(attachment);
        attachmentExports.push({
          filename: attachment.filename,
          type: attachment.type,
          size: Number(attachment.size),
          data,
        });
      } catch (err) {
        console.warn(`Failed to fetch attachment "${attachment.filename}" for memo export:`, err);
      }
    }

    memoExports.push({
      content: memo.content,
      visibility: String(memo.visibility),
      tags: memo.tags,
      pinned: memo.pinned,
      createTime: memo.createTime ? timestampDate(memo.createTime).toISOString() : undefined,
      updateTime: memo.updateTime ? timestampDate(memo.updateTime).toISOString() : undefined,
      location: memo.location
        ? {
            placeholder: memo.location.placeholder,
            latitude: memo.location.latitude,
            longitude: memo.location.longitude,
          }
        : undefined,
      attachments: attachmentExports,
    });
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    memos: memoExports,
  };
}

function downloadBlob(content: string | Blob, filename: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function memoToMarkdown(memo: MemoExport, attachmentNames: string[]): string {
  const lines: string[] = [];

  if (memo.tags.length > 0) {
    lines.push(memo.tags.map((tag) => `#${tag}`).join(" "));
    lines.push("");
  }

  if (memo.createTime) {
    lines.push(`Date: ${memo.createTime}`);
    lines.push("");
  }

  lines.push(memo.content);

  if (memo.attachments.length > 0) {
    lines.push("");
    for (let i = 0; i < memo.attachments.length; i++) {
      const uniqueName = attachmentNames[i];
      if (!uniqueName) continue; // attachment failed to decode — skip markdown reference
      const att = memo.attachments[i];
      const isEmbeddable = att.type.startsWith("image/") || att.type.startsWith("video/") || att.type.startsWith("audio/");
      lines.push(isEmbeddable ? `![[attachments/${uniqueName}]]` : `[[attachments/${uniqueName}]]`);
    }
  }

  lines.push("");
  lines.push("---");

  return lines.join("\n");
}

export async function exportMemosAsJson(memos: Memo[]): Promise<void> {
  const exportData = await buildExportData(memos);
  const json = JSON.stringify(exportData, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(json, `memos-export-${date}.json`);
}

export async function exportMemosAsMarkdown(memos: Memo[]): Promise<void> {
  const exportData = await buildExportData(memos);
  const date = new Date().toISOString().slice(0, 10);

  const entries: ZipEntry[] = [];
  const nameCounts = new Map<string, number>();
  const markdownParts: string[] = [];

  // Single pass: deduplicate attachment names for both markdown refs and ZIP paths.
  for (const memo of exportData.memos) {
    const attachmentUniqueNames: string[] = [];
    for (const att of memo.attachments) {
      const count = nameCounts.get(att.filename) ?? 0;
      nameCounts.set(att.filename, count + 1);
      const uniqueName =
        count > 0
          ? att.filename.includes(".")
            ? att.filename.replace(/(\.[^.]+)$/, `_${count}$1`)
            : `${att.filename}_${count}`
          : att.filename;
      try {
        const bytes = base64ToBytes(att.data);
        entries.push({ path: `attachments/${uniqueName}`, data: bytes });
        attachmentUniqueNames.push(uniqueName);
      } catch (err) {
        console.warn(`Failed to decode attachment "${att.filename}" for ZIP export:`, err);
        attachmentUniqueNames.push(""); // marker so indices stay aligned; markdown skips empty names
      }
    }
    markdownParts.push(memoToMarkdown(memo, attachmentUniqueNames));
  }

  const markdown = markdownParts.join("\n\n");
  entries.unshift({ path: "memos.md", data: new TextEncoder().encode(markdown) });

  const zip = createZip(entries);
  downloadBlob(zip, `memos-export-${date}.zip`);
}

export async function fetchAllMemosForExport(): Promise<Memo[]> {
  return fetchAllMemos();
}

export type { ExportData, MemoExport };
export { EXPORT_VERSION };
