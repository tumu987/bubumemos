import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentThumbnailUrl, getAttachmentType, getAttachmentUrl } from "@/utils/attachment";
import MdCard from "./MdCard";
import PdfCard from "./PdfCard";

interface AttachmentCardProps {
  attachment: Attachment;
  onClick?: () => void;
  onPdfPreview?: () => void;
  onMdPreview?: () => void;
  className?: string;
}

const AttachmentCard = ({ attachment, onClick, onPdfPreview, onMdPreview, className }: AttachmentCardProps) => {
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
    return <video src={sourceUrl} className={cn("w-full h-full object-contain rounded-lg", className)} controls preload="metadata" />;
  }

  if (attachmentType === "audio/*") {
    return <audio src={sourceUrl} className={cn("w-full rounded-lg", className)} controls preload="metadata" />;
  }

  if (attachmentType === "application/pdf") {
    return <PdfCard filename={attachment.filename} size={Number(attachment.size)} onClick={onPdfPreview ?? (() => {})} />;
  }

  if (attachmentType === "text/markdown") {
    return <MdCard filename={attachment.filename} size={Number(attachment.size)} onClick={onMdPreview ?? (() => {})} />;
  }

  return null;
};

export default AttachmentCard;
