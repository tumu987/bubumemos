import { DownloadIcon, FileIcon, PaperclipIcon } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import AudioPlayerDialog from "@/components/AudioPlayerDialog";
import MetadataSection from "@/components/MemoMetadata/MetadataSection";
import MotionPhotoPreview from "@/components/MotionPhotoPreview";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import type { AttachmentVisualItem, PreviewMediaItem } from "@/utils/media-item";
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
import PdfCard from "./PdfCard";
import { resolveVisualGalleryLayout } from "./visualGalleryLayout";

interface AttachmentListViewProps {
  attachments: Attachment[];
  onImagePreview?: (items: PreviewMediaItem[], index: number) => void;
  onPdfPreview?: (items: PreviewMediaItem[], index: number) => void;
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
}: PropsWithChildren<{ className?: string; onPreview?: (e: React.MouseEvent) => void; overlayLabel?: string }>) => {
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
  onPdfPreview,
  className,
  overlayLabel,
}: {
  item: VisualItem;
  onPreview?: () => void;
  onPdfPreview?: () => void;
  className?: string;
  overlayLabel?: string;
}) => {
  const motionPreviewProps = item.kind === "motion" ? getMotionPreviewProps(item) : undefined;
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleClick = (_e: React.MouseEvent) => {
    if (item.kind === "video") {
      videoRef.current?.requestFullscreen().catch(() => {});
      return;
    }
    if (item.kind === "pdf") {
      onPdfPreview?.();
      return;
    }
    onPreview?.();
  };

  return (
    <VisualTile className={cn("block h-full w-full", className)} onPreview={handleClick} overlayLabel={overlayLabel}>
      {item.kind === "video" ? (
        <div className="relative h-full w-full bg-neutral-900">
          <video
            ref={videoRef}
            src={item.sourceUrl}
            className="absolute inset-0 h-full w-full object-contain"
            preload="metadata"
            playsInline
            disablePictureInPicture
            controls
          />
        </div>
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
        <div className="flex h-full w-full items-center justify-center bg-white p-4">
          <PdfCard filename={item.filename} size={item.attachments[0]?.size ? Number(item.attachments[0].size) : undefined} />
        </div>
      ) : (
        <img src={item.posterUrl} alt={item.filename} className={COVER_MEDIA_CLASS} loading="lazy" decoding="async" />
      )}
    </VisualTile>
  );
};

const SingleVisualItem = ({ item, onPreview, onPdfPreview }: { item: VisualItem; onPreview?: () => void; onPdfPreview?: () => void }) => {
  const motionPreviewProps = item.kind === "motion" ? getMotionPreviewProps(item) : undefined;
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoClick = useCallback(() => {
    videoRef.current?.requestFullscreen().catch(() => {});
  }, []);

  if (item.kind === "pdf") {
    return (
      <VisualTile className="inline-block max-w-full" onPreview={() => onPdfPreview?.()}>
        <PdfCard filename={item.filename} size={item.attachments[0]?.size ? Number(item.attachments[0].size) : undefined} />
      </VisualTile>
    );
  }

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

  return (
    <VisualTile className={cn("block", SINGLE_VIDEO_CARD_WIDTH_CLASS)} onPreview={handleVideoClick}>
      <div className="relative aspect-video bg-neutral-900">
        <video
          ref={videoRef}
          src={item.sourceUrl}
          className="absolute inset-0 h-full w-full object-contain"
          preload="metadata"
          playsInline
          disablePictureInPicture
          controls
        />
      </div>
    </VisualTile>
  );
};

const VisualGallery = ({
  items,
  onPreview,
  onPdfPreview,
}: {
  items: VisualItem[];
  onPreview?: (itemId: string) => void;
  onPdfPreview?: (itemId: string) => void;
}) => {
  const layout = resolveVisualGalleryLayout(items);

  if (!layout) {
    return null;
  }

  if (layout.mode === "single") {
    return (
      <div className="w-full">
        <SingleVisualItem
          item={layout.item}
          onPreview={() => onPreview?.(layout.item.id)}
          onPdfPreview={() => onPdfPreview?.(layout.item.id)}
        />
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
          onPdfPreview={() => onPdfPreview?.(item.id)}
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
  onExpand?: (attachment: Attachment) => void;
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
        onExpand={onExpand ? () => onExpand(attachment) : undefined}
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

const AttachmentListView = ({ attachments, onImagePreview, onPdfPreview }: AttachmentListViewProps) => {
  const { visual, audio, docs } = useMemo(() => separateAttachments(attachments), [attachments]);
  const visualItems = useMemo(() => buildAttachmentVisualItems(visual), [visual]);
  const previewItems = useMemo(() => visualItems.map((item) => item.previewItem), [visualItems]);
  const pdfPreviewItems = useMemo(() => previewItems.filter((item) => item.kind === "pdf"), [previewItems]);
  const hasVisual = visualItems.length > 0;
  const hasAudio = audio.length > 0;
  const hasDocs = docs.length > 0;
  const hasMedia = hasVisual || hasAudio;

  const [audioPlayerState, setAudioPlayerState] = useState<{
    open: boolean;
    filename: string;
    sourceUrl: string;
    mimeType: string;
    size?: number;
  }>({ open: false, filename: "", sourceUrl: "", mimeType: "" });

  if (attachments.length === 0) {
    return null;
  }

  const handlePreview = useCallback(
    (itemId: string) => {
      const index = previewItems.findIndex((item) => item.id === itemId);
      onImagePreview?.(previewItems, index >= 0 ? index : 0);
    },
    [previewItems, onImagePreview],
  );

  const handlePdfPreview = useCallback(
    (itemId: string) => {
      const index = pdfPreviewItems.findIndex((item) => item.id === itemId);
      onPdfPreview?.(pdfPreviewItems, index >= 0 ? index : 0);
    },
    [pdfPreviewItems, onPdfPreview],
  );

  const handleAudioExpand = useCallback((attachment: Attachment) => {
    setAudioPlayerState({
      open: true,
      filename: attachment.filename,
      sourceUrl: getAttachmentUrl(attachment),
      mimeType: attachment.type,
      size: Number(attachment.size),
    });
  }, []);

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
            {hasVisual && <VisualGallery items={visualItems} onPreview={handlePreview} onPdfPreview={handlePdfPreview} />}
            {hasAudio && <AudioList attachments={audio.filter(isAudioAttachment)} compact onExpand={handleAudioExpand} />}
          </div>
        )}
        {hasMedia && hasDocs && <Divider />}
        {hasDocs && <DocsList attachments={docs} />}
      </MetadataSection>

      <AudioPlayerDialog
        open={audioPlayerState.open}
        onOpenChange={(open) => setAudioPlayerState((prev) => ({ ...prev, open }))}
        filename={audioPlayerState.filename}
        sourceUrl={audioPlayerState.sourceUrl}
        mimeType={audioPlayerState.mimeType}
        size={audioPlayerState.size}
      />
    </>
  );
};

export default AttachmentListView;
