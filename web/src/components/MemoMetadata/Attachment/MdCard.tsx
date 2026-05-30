import { FileText } from "lucide-react";
import { formatFileSize } from "@/utils/format";

interface Props {
  filename: string;
  size: number;
  onClick: () => void;
}

const MdCard = ({ filename, size, onClick }: Props) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-lg border border-border bg-linear-to-b from-white to-gray-100 p-3 text-left transition-colors hover:bg-gray-50"
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600">
      <FileText className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium text-foreground">{filename}</div>
      <div className="text-xs text-muted-foreground">{formatFileSize(size)}</div>
    </div>
  </button>
);

export default MdCard;
