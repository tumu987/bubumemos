import { Maximize2, PauseIcon, PlayIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/utils";
import { formatFileSize, getFileTypeLabel } from "@/utils/format";
import { formatAudioTime } from "./MemoMetadata/Attachment/attachmentHelpers";

const PLAYBACK_RATES = [1, 1.5, 2] as const;

interface AudioPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  sourceUrl: string;
  mimeType: string;
  size?: number;
}

const AudioPlayerDialog = ({ open, onOpenChange, filename, sourceUrl, mimeType, size }: AudioPlayerDialogProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);

  const fileTypeLabel = getFileTypeLabel(mimeType);
  const fileSizeLabel = size ? formatFileSize(size) : undefined;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || Number.isNaN(value)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const nextRate = () => {
    const idx = PLAYBACK_RATES.indexOf(playbackRate);
    setPlaybackRate(PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!h-[100vh] !w-[100vw] !max-h-[100vh] !max-w-[100vw] overflow-hidden border-0 bg-black/92 p-0 shadow-none"
        aria-describedby="audio-player-description"
      >
        <VisuallyHidden>
          <DialogTitle>{filename}</DialogTitle>
        </VisuallyHidden>

        <div className="absolute inset-x-0 top-0 z-20 bg-linear-to-b from-black/70 via-black/35 to-transparent px-3 pb-6 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-white">
              <div className="truncate text-sm font-medium">{filename}</div>
              <div className="mt-1 text-xs text-white/70">
                {fileTypeLabel}
                {fileSizeLabel ? ` · ${fileSizeLabel}` : ""}
              </div>
            </div>
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full bg-white/10 text-white hover:bg-white/16 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          className="flex h-full w-full flex-col items-center justify-center gap-8 px-6 pb-20 pt-16 sm:px-16 sm:pb-8 sm:pt-20"
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
        >
          <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-white/10">
            <button
              type="button"
              onClick={togglePlayback}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/20"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <PauseIcon className="h-10 w-10" /> : <PlayIcon className="h-10 w-10 translate-x-[1.5px]" />}
            </button>
          </div>

          <div className="w-full max-w-lg space-y-4">
            <div className="relative flex h-4 items-center">
              <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/15" />
              <div className="absolute left-0 h-1.5 rounded-full bg-white/60" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={(e) => handleSeek(Number(e.target.value))}
                aria-label="Seek"
                className="relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent outline-none
                  [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent
                  [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                  [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent
                  [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white"
                disabled={duration === 0}
              />
            </div>

            <div className="flex items-center justify-between text-white/80">
              <span className="text-sm tabular-nums">{formatAudioTime(currentTime)}</span>
              <span className="text-sm tabular-nums">{duration > 0 ? formatAudioTime(duration) : "--:--"}</span>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={nextRate}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {playbackRate}x
              </button>
            </div>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={sourceUrl}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />

        <div id="audio-player-description" className="sr-only">
          Audio player dialog for {filename}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AudioPlayerDialog;

export const AudioExpandButton = ({ onClick, className }: { onClick: () => void; className?: string }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={cn(
      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
      className,
    )}
    aria-label="Open full-screen player"
  >
    <Maximize2 className="h-3 w-3" />
  </button>
);
