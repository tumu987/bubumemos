import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useUser } from "@/hooks/useUserQueries";
import { findTagMetadata } from "@/lib/tag";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import type { MdPreviewMediaItem, PdfPreviewMediaItem } from "@/utils/media-item";
import { isSuperUser } from "@/utils/user";
import MdPreviewDialog from "../MdPreviewDialog";
import MemoShareImageDialog from "../MemoActionMenu/MemoShareImageDialog";
import MemoEditor from "../MemoEditor";
import PdfPreviewDialog from "../PdfPreviewDialog";
import PreviewImageDialog from "../PreviewImageDialog";
import { MemoBody, MemoCommentListView, MemoHeader } from "./components";
import { MEMO_CARD_BASE_CLASSES } from "./constants";
import { useImagePreview } from "./hooks";
import { computeCommentAmount, MemoViewContext } from "./MemoViewContext";
import type { MemoViewProps } from "./types";

const MemoView: React.FC<MemoViewProps> = (props: MemoViewProps) => {
  const { memo: memoData, className, parentPage: parentPageProp, compact, showCreator, showVisibility, showPinned } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);

  const currentUser = useCurrentUser();
  const { tagsSetting } = useInstance();
  const creator = useUser(memoData.creator).data;
  const isArchived = memoData.state === State.ARCHIVED;
  const readonly = memoData.creator !== currentUser?.name && !isSuperUser(currentUser);
  const parentPage = parentPageProp || "/";

  // Blur content when any tag has blur_content enabled in the instance tag settings.
  const [showBlurredContent, setShowBlurredContent] = useState(false);
  const blurred = memoData.tags?.some((tag) => findTagMetadata(tag, tagsSetting)?.blurContent) ?? false;
  const toggleBlurVisibility = useCallback(() => setShowBlurredContent((prev) => !prev), []);

  const { previewState, openPreview, setPreviewOpen } = useImagePreview();

  const [pdfPreviewState, setPdfPreviewState] = useState<{ open: boolean; items: PdfPreviewMediaItem[]; index: number }>({
    open: false,
    items: [],
    index: 0,
  });
  const [mdPreviewState, setMdPreviewState] = useState<{ open: boolean; items: MdPreviewMediaItem[]; index: number }>({
    open: false,
    items: [],
    index: 0,
  });

  const openPdfPreview = useCallback((items: PdfPreviewMediaItem[], index = 0) => {
    setPdfPreviewState({ open: true, items, index });
  }, []);

  const openMdPreview = useCallback((items: MdPreviewMediaItem[], index = 0) => {
    setMdPreviewState({ open: true, items, index });
  }, []);

  const setPdfPreviewOpen = useCallback((open: boolean) => {
    setPdfPreviewState((prev) => ({ ...prev, open }));
  }, []);

  const setMdPreviewOpen = useCallback((open: boolean) => {
    setMdPreviewState((prev) => ({ ...prev, open }));
  }, []);

  const openEditor = useCallback(() => setShowEditor(true), []);
  const closeEditor = useCallback(() => setShowEditor(false), []);

  const location = useLocation();
  const isInMemoDetailPage = location.pathname.startsWith(`/${memoData.name}`) || location.pathname.startsWith("/memos/shares/");
  const showCommentPreview = !isInMemoDetailPage && computeCommentAmount(memoData) > 0;

  useEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return;
    }

    const updateWidth = (nextWidth?: number) => {
      const width = Math.round(nextWidth ?? card.getBoundingClientRect().width);
      setCardWidth((prev) => (prev === width ? prev : width));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => updateWidth();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width);
    });

    resizeObserver.observe(card);
    return () => resizeObserver.disconnect();
  }, []);

  const contextValue = useMemo(
    () => ({
      memo: memoData,
      creator,
      currentUser,
      parentPage,
      cardWidth,
      isArchived,
      readonly,
      showBlurredContent,
      blurred,
      openEditor,
      toggleBlurVisibility,
      openPreview,
      openPdfPreview,
      openMdPreview,
    }),
    [
      memoData,
      creator,
      currentUser,
      parentPage,
      cardWidth,
      isArchived,
      readonly,
      showBlurredContent,
      blurred,
      openEditor,
      toggleBlurVisibility,
      openPreview,
      openPdfPreview,
      openMdPreview,
    ],
  );

  if (showEditor) {
    return (
      <MemoEditor
        autoFocus
        className="mb-2"
        cacheKey={`inline-memo-editor-${memoData.name}`}
        memo={memoData}
        parentMemoName={memoData.parent || undefined}
        onConfirm={closeEditor}
        onCancel={closeEditor}
      />
    );
  }

  const article = (
    <article
      className={cn(MEMO_CARD_BASE_CLASSES, showCommentPreview ? "mb-0 rounded-b-none" : "mb-2", className)}
      ref={cardRef}
      tabIndex={readonly ? -1 : 0}
    >
      <MemoHeader showCreator={showCreator} showVisibility={showVisibility} showPinned={showPinned} />

      <MemoBody compact={compact} />

      <PreviewImageDialog
        open={previewState.open}
        onOpenChange={setPreviewOpen}
        items={previewState.items}
        initialIndex={previewState.index}
      />

      <PdfPreviewDialog
        open={pdfPreviewState.open}
        onOpenChange={setPdfPreviewOpen}
        items={pdfPreviewState.items}
        initialIndex={pdfPreviewState.index}
      />

      <MdPreviewDialog
        open={mdPreviewState.open}
        onOpenChange={setMdPreviewOpen}
        items={mdPreviewState.items}
        initialIndex={mdPreviewState.index}
      />

      {props.onShareImageDialogOpenChange && (
        <MemoShareImageDialog open={Boolean(props.shareImageDialogOpen)} onOpenChange={props.onShareImageDialogOpenChange} />
      )}
    </article>
  );

  return (
    <MemoViewContext.Provider value={contextValue}>
      {showCommentPreview ? (
        <div className="w-full mb-2">
          {article}
          <MemoCommentListView />
        </div>
      ) : (
        article
      )}
    </MemoViewContext.Provider>
  );
};

export default memo(MemoView);
