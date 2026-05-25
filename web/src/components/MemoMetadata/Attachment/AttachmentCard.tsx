import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentThumbnailUrl, getAttachmentType, getAttachmentUrl } from "@/utils/attachment";
import { formatFileSize } from "@/utils/format";

interface AttachmentCardProps {
  attachment: Attachment;
  onClick?: () => void;
  className?: string;
}

const AttachmentCard = ({ attachment, onClick, className }: AttachmentCardProps) => {
  const attachmentType = getAttachmentType(attachment);
  const sourceUrl = getAttachmentUrl(attachment);

  if (attachmentType === "image/*") {
    return (
      <img
        src={getAttachmentThumbnailUrl(attachment)}
        alt={attachment.filename}
        className={cn("w-full h-full object-cover rounded-lg cursor-pointer", className)}
        onClick={onClick}
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src.includes("?thumbnail=true")) {
            target.src = sourceUrl;
          }
        }}
        decoding="async"
        loading="lazy"
      />
    );
  }

  if (attachmentType === "video/*") {
    return <video src={sourceUrl} className={cn("w-full h-full object-cover rounded-lg", className)} controls preload="metadata" />;
  }

  if (attachmentType === "audio/*") {
    return <audio src={sourceUrl} className={cn("w-full rounded-lg", className)} controls preload="metadata" />;
  }

  if (attachmentType === "application/pdf") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg bg-linear-to-b from-white to-gray-50 p-4 cursor-pointer hover:bg-gray-100 transition-colors",
          className,
        )}
      >
        <FileText className="h-10 w-10 text-rose-500/80" strokeWidth={1.5} />
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className="max-w-[10rem] truncate text-xs font-medium">{attachment.filename}</span>
          {attachment.size > 0 && <span className="text-[10px] text-muted-foreground">{formatFileSize(Number(attachment.size))}</span>}
        </div>
      </button>
    );
  }

  return null;
};

export default AttachmentCard;
