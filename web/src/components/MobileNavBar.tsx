import { Button } from "@/components/ui/button";

interface Props {
  current: number;
  total: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

const MobileNavBar = ({ current, total, canGoPrevious, canGoNext, onPrevious, onNext }: Props) => (
  <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-6">
    <div className="mx-auto flex max-w-xs items-center justify-between rounded-full bg-black/55 px-2 py-2 backdrop-blur-sm">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onPrevious}
        disabled={!canGoPrevious}
        className="rounded-full px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
      >
        Prev
      </Button>
      <div className="px-3 text-xs text-white/75">
        {current} / {total}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onNext}
        disabled={!canGoNext}
        className="rounded-full px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
      >
        Next
      </Button>
    </div>
  </div>
);

export default MobileNavBar;
