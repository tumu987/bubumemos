import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize, getFileTypeLabel } from "@/utils/format";
import {
  MEDIA_HOVER_GRADIENT_CLASS,
  MEDIA_HOVER_SURFACE_CLASS,
  NATURAL_MEDIA_CLASS,
  VISUAL_TILE_BUTTON_CLASS,
} from "./attachmentVisualClasses";

interface PdfCardProps {
  filename: string;
  size?: number;
  className?: string;
}

const PdfCard = ({ filename, size, className }: PdfCardProps) => {
  const fileTypeLabel = getFileTypeLabel("application/pdf");

  return (
    <div className={cn(VISUAL_TILE_BUTTON_CLASS, "inline-block max-w-full", className)}>
      <div className={MEDIA_HOVER_SURFACE_CLASS}>
        <div
          className={cn(
            NATURAL_MEDIA_CLASS,
            "flex min-h-[12rem] min-w-[16rem] flex-col items-center justify-center gap-3 bg-linear-to-b from-white to-gray-50 px-6 py-8",
          )}
        >
          <FileText className="h-16 w-16 text-rose-500/80" strokeWidth={1.5} />
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="max-w-[12rem] truncate text-sm font-medium text-foreground" title={filename}>
              {filename}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{fileTypeLabel}</span>
              {size !== undefined && size > 0 && (
                <>
                  <span className="text-muted-foreground/40">•</span>
                  <span>{formatFileSize(size)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className={MEDIA_HOVER_GRADIENT_CLASS} aria-hidden />
      </div>
    </div>
  );
};

export default PdfCard;
