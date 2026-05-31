import { DownloadIcon, FileIcon, PaperclipIcon } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useMemo, useState } from "react";
import AudioPlayerDialog from "@/components/AudioPlayerDialog";
import MetadataSection from "@/components/MemoMetadata/MetadataSection";
import MotionPhotoPreview from "@/components/MotionPhotoPreview";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import type { AttachmentVisualItem, MdPreviewMediaItem, PdfPreviewMediaItem, PreviewMediaItem } from "@/utils/media-item";
import { buildAttachmentVisualItems } from "@/utils/media-item";
import AudioAttachmentItem from "./AudioAttachmentItem";
import { getAttachmentMetadata, isAudioAttachment, separateAttachments } from "./attachmentHelpers";
import {
  COVER_MEDIA_CLASS,
  MEDIA_HOVER_GRADIENT_CLASS,
  MEDIA_HOVER_SURFACE_CLASS,
  NATURAL_MEDIA_CLASS,
  OVERFLOW_TILE_OVERLAY_CLASS,
  SINGLE_MOTION_VIDEO_CLASS,
  SINGLE_VIDEO_CARD_WIDTH_CLASS,
  VISUAL_TILE_BUTTON_CLASS,
} from "./attachmentVisualClasses";
import MdCard from "./MdCard";
import PdfCard from "./PdfCard";
import { resolveVisualGalleryLayout } from "./visualGalleryLayout";

interface AttachmentListViewProps {
  attachments: Attachment[];
  onImagePreview?: (items: PreviewMediaItem[], index: number) => void;
  onPdfPreview?: (items: PdfPreviewMediaItem[], index: number) => void;
  onMdPreview?: (items: MdPreviewMediaItem[], index: number) => void;
}

type VisualItem = AttachmentVisualItem;

const AttachmentMeta = ({ attachment }: { attachment: Attachment }) => {
  const { fileTypeLabel, fileSizeLabel } = getAttachmentMetadata(attachment);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      <span>{fileTypeLabel}</span>
      {fileSizeLabel && (
        <>
          <span className="text-muted-foreground/40">•</span>
          <span>{fileSizeLabel}</span>
        </>
      )}
    </div>
  );
};

const DocumentItem = ({ attachment }: { attachment: Attachment }) => {
  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/65 px-3 py-2.5 transition-colors hover:bg-accent/20">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
          <FileIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium leading-tight text-foreground" title={attachment.filename}>
            {attachment.filename}
          </div>
          <AttachmentMeta attachment={attachment} />
        </div>
      </div>
      <DownloadIcon className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground/70" />
    </div>
  );
};

const getMotionPreviewProps = (item: VisualItem) => ({
  motionUrl: item.previewItem.kind === "motion" ? item.previewItem.motionUrl : item.sourceUrl,
  presentationTimestampUs: item.previewItem.kind === "motion" ? item.previewItem.presentationTimestampUs : undefined,
});

const VisualTile = ({
  className,
  onPreview,
  overlayLabel,
  children,
}: PropsWithChildren<{ className?: string; onPreview?: () => void; overlayLabel?: string }>) => {
  return (
    <button type="button" className={cn(VISUAL_TILE_BUTTON_CLASS, className)} onClick={onPreview}>
      <div className={MEDIA_HOVER_SURFACE_CLASS}>
        {children}
        <div className={MEDIA_HOVER_GRADIENT_CLASS} aria-hidden />
      </div>
      {overlayLabel && <div className={OVERFLOW_TILE_OVERLAY_CLASS}>{overlayLabel}</div>}
    </button>
  );
};

const CollageVisualItem = ({
  item,
  onPreview,
  className,
  overlayLabel,
}: {
  item: VisualItem;
  onPreview?: () => void;
  className?: string;
  overlayLabel?: string;
}) => {
  const motionPreviewProps = item.kind === "motion" ? getMotionPreviewProps(item) : undefined;

  return (
    <VisualTile className={cn("block h-full w-full", className)} onPreview={onPreview} overlayLabel={overlayLabel}>
      {item.kind === "video" ? (
        <video
          src={item.sourceUrl}
          className={cn(COVER_MEDIA_CLASS, "object-contain")}
          controls
          playsInline
          preload="metadata"
        />
      ) : item.kind === "motion" && motionPreviewProps ? (
        <MotionPhotoPreview
          posterUrl={item.posterUrl}
          motionUrl={motionPreviewProps.motionUrl}
          alt={item.filename}
          presentationTimestampUs={motionPreviewProps.presentationTimestampUs}
          containerClassName="h-full w-full"
          badgeClassName="left-2 top-2 px-2 py-0.5 text-[10px]"
          mediaClassName={COVER_MEDIA_CLASS}
        />
      ) : item.kind === "pdf" ? (
        <div className={cn(COVER_MEDIA_CLASS, "flex items-center justify-center")}>
          <PdfCard filename={item.filename} size={0} onClick={() => onPreview?.()} />
        </div>
      ) : item.kind === "md" ? (
        <div className={cn(COVER_MEDIA_CLASS, "flex items-center justify-center")}>
          <MdCard filename={item.filename} size={0} onClick={() => onPreview?.()} />
        </div>
      ) : (
        <img src={item.posterUrl} alt={item.filename} className={COVER_MEDIA_CLASS} loading="lazy" decoding="async" />
      )}
    </VisualTile>
  );
};

const SingleVisualItem = ({ item, onPreview }: { item: VisualItem; onPreview?: () => void }) => {
  const motionPreviewProps = item.kind === "motion" ? getMotionPreviewProps(item) : undefined;

  if (item.kind === "image") {
    return (
      <VisualTile className="inline-block max-w-full" onPreview={onPreview}>
        <img src={item.posterUrl} alt={item.filename} className={NATURAL_MEDIA_CLASS} loading="lazy" decoding="async" />
      </VisualTile>
    );
  }

  if (item.kind === "motion" && motionPreviewProps) {
    return (
      <VisualTile className="inline-block max-w-full" onPreview={onPreview}>
        <MotionPhotoPreview
          posterUrl={item.posterUrl}
          motionUrl={motionPreviewProps.motionUrl}
          alt={item.filename}
          presentationTimestampUs={motionPreviewProps.presentationTimestampUs}
          containerClassName="max-w-full"
          posterClassName={cn(NATURAL_MEDIA_CLASS, "object-contain")}
          videoClassName={SINGLE_MOTION_VIDEO_CLASS}
          badgeClassName="left-2 top-2 px-2 py-0.5 text-[10px]"
        />
      </VisualTile>
    );
  }

  if (item.kind === "video") {
    return (
      <VisualTile className={cn("block", SINGLE_VIDEO_CARD_WIDTH_CLASS)} onPreview={onPreview}>
        <div className="relative aspect-video bg-black/5">
          <video
            src={item.sourceUrl}
            className={cn(COVER_MEDIA_CLASS, "object-contain")}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      </VisualTile>
    );
  }

  if (item.kind === "pdf") {
    return (
      <VisualTile className="block max-w-full" onPreview={onPreview}>
        <PdfCard filename={item.filename} size={0} onClick={() => onPreview?.()} />
      </VisualTile>
    );
  }

  if (item.kind === "md") {
    return (
      <VisualTile className="block max-w-full" onPreview={onPreview}>
        <MdCard filename={item.filename} size={0} onClick={() => onPreview?.()} />
      </VisualTile>
    );
  }

  return null;
};

const VisualGallery = ({ items, onPreview }: { items: VisualItem[]; onPreview?: (itemId: string) => void }) => {
  const layout = resolveVisualGalleryLayout(items);

  if (!layout) {
    return null;
  }

  if (layout.mode === "single") {
    return (
      <div className="w-full">
        <SingleVisualItem item={layout.item} onPreview={() => onPreview?.(layout.item.id)} />
      </div>
    );
  }

  return (
    <div className={layout.containerClassName}>
      {layout.cells.map(({ item, className, overlayLabel }) => (
        <CollageVisualItem
          key={item.id}
          item={item}
          className={className}
          overlayLabel={overlayLabel}
          onPreview={() => onPreview?.(item.id)}
        />
      ))}
    </div>
  );
};

const AudioList = ({
  attachments,
  compact = false,
  onExpand,
}: {
  attachments: Attachment[];
  compact?: boolean;
  onExpand?: (sourceUrl: string, filename: string, mimeType: string) => void;
}) => (
  <div className={cn("gap-2", compact ? "grid grid-cols-1 sm:grid-cols-2" : "flex flex-col")}>
    {attachments.map((attachment) => (
      <AudioAttachmentItem
        key={attachment.name}
        filename={attachment.filename}
        sourceUrl={getAttachmentUrl(attachment)}
        mimeType={attachment.type}
        size={Number(attachment.size)}
        compact={compact}
        onExpand={onExpand ? () => onExpand(getAttachmentUrl(attachment), attachment.filename, attachment.type) : undefined}
      />
    ))}
  </div>
);

const DocsList = ({ attachments }: { attachments: Attachment[] }) => (
  <div className="flex flex-col gap-2">
    {attachments.map((attachment) => (
      <a key={attachment.name} href={getAttachmentUrl(attachment)} download title={`Download ${attachment.filename}`}>
        <DocumentItem attachment={attachment} />
      </a>
    ))}
  </div>
);

const Divider = () => <div className="border-t border-border/70 opacity-80" />;

const AttachmentListView = ({ attachments, onImagePreview, onPdfPreview, onMdPreview }: AttachmentListViewProps) => {
  const [audioDialog, setAudioDialog] = useState<{ open: boolean; filename: string; url: string; mimeType: string; size?: number }>({ open: false, filename: "", url: "", mimeType: "" });
  const { visual, audio, docs } = useMemo(() => separateAttachments(attachments), [attachments]);
  const visualItems = useMemo(() => buildAttachmentVisualItems(visual), [visual]);
  const previewItems = useMemo(() => visualItems.map((item) => item.previewItem), [visualItems]);
  const hasVisual = visualItems.length > 0;
  const hasAudio = audio.length > 0;
  const hasDocs = docs.length > 0;
  const hasMedia = hasVisual || hasAudio;

  if (attachments.length === 0) {
    return null;
  }

  const handlePreview = (itemId: string) => {
    const visualItem = visualItems.find((item) => item.id === itemId);
    if (visualItem?.kind === "pdf") {
      const pdfItems = previewItems.filter((item): item is PdfPreviewMediaItem => item.kind === "pdf");
      const index = pdfItems.findIndex((item) => item.id === itemId);
      onPdfPreview?.(pdfItems, index >= 0 ? index : 0);
      return;
    }
    if (visualItem?.kind === "md") {
      const mdItems = previewItems.filter((item): item is MdPreviewMediaItem => item.kind === "md");
      const index = mdItems.findIndex((item) => item.id === itemId);
      onMdPreview?.(mdItems, index >= 0 ? index : 0);
      return;
    }
    const mediaOnly = previewItems.filter((item) => item.kind !== "pdf" && item.kind !== "md");
    const index = mediaOnly.findIndex((item) => item.id === itemId);
    onImagePreview?.(mediaOnly, index >= 0 ? index : 0);
  };

  return (
    <>
      <MetadataSection
        icon={PaperclipIcon}
        title="Attachments"
        count={visualItems.length + audio.length + docs.length}
        contentClassName="flex flex-col gap-2 p-2"
      >
        {hasMedia && (
          <div className="flex flex-col gap-2">
            {hasVisual && <VisualGallery items={visualItems} onPreview={handlePreview} />}
            {hasAudio && (
              <AudioList
                attachments={audio.filter(isAudioAttachment)}
                compact
                onExpand={(url, filename, mimeType) => setAudioDialog({ open: true, url, filename, mimeType })}
              />
            )}
          </div>
        )}
        {hasMedia && hasDocs && <Divider />}
        {hasDocs && <DocsList attachments={docs} />}
      </MetadataSection>
      <AudioPlayerDialog
        open={audioDialog.open}
        onOpenChange={(open) => setAudioDialog((prev) => ({ ...prev, open }))}
        filename={audioDialog.filename}
        sourceUrl={audioDialog.url}
        mimeType={audioDialog.mimeType}
        size={audioDialog.size}
      />
    </>
  );
};

export default AttachmentListView;
