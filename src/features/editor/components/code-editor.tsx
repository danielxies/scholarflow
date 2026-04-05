import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Annotation } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { indentWithTab } from "@codemirror/commands";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { minimap } from "../extensions/minimap";
import { customTheme } from "../extensions/theme";
import { getLanguageExtension } from "../extensions/language-extension";
import { customSetup } from "../extensions/custom-setup";
import { suggestion } from "../extensions/suggestion";
import { quickEdit } from "../extensions/quick-edit";
import { selectionTooltip } from "../extensions/selection-tooltip";

interface Props {
  fileName: string;
  value?: string;
  onChange: (value: string) => void;
}

const remoteSyncAnnotation = Annotation.define<boolean>();

export const CodeEditor = ({
  fileName,
  value = "",
  onChange
}: Props) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const lastAppliedRemoteValueRef = useRef(value);
  const pendingRemoteValueRef = useRef<string | null>(null);
  const localDirtyRef = useRef(false);
  const [hasPendingRemoteUpdate, setHasPendingRemoteUpdate] = useState(false);

  const languageExtension = useMemo(() => {
    return getLanguageExtension(fileName);
  }, [fileName]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setPendingRemoteValue = useCallback((nextPendingValue: string | null) => {
    pendingRemoteValueRef.current = nextPendingValue;
    queueMicrotask(() => {
      setHasPendingRemoteUpdate(nextPendingValue !== null);
    });
  }, []);

  const clearPendingRemoteUpdate = useCallback(() => {
    setPendingRemoteValue(null);
  }, [setPendingRemoteValue]);

  const applyRemoteValue = useCallback((nextValue: string) => {
    const view = viewRef.current;

    lastAppliedRemoteValueRef.current = nextValue;
    localDirtyRef.current = false;
    clearPendingRemoteUpdate();

    if (!view) {
      return;
    }

    const selection = view.state.selection.main;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: nextValue,
      },
      selection: {
        anchor: Math.min(selection.anchor, nextValue.length),
        head: Math.min(selection.head, nextValue.length),
      },
      annotations: remoteSyncAnnotation.of(true),
    });
  }, [clearPendingRemoteUpdate]);

  const reloadLatestSavedVersion = useCallback(() => {
    const pendingRemoteValue = pendingRemoteValueRef.current;
    if (pendingRemoteValue === null) {
      return;
    }

    applyRemoteValue(pendingRemoteValue);
  }, [applyRemoteValue]);

  useEffect(() => {
    if (!editorRef.current) return;

    const view = new EditorView({
      doc: lastAppliedRemoteValueRef.current,
      parent: editorRef.current,
      extensions: [
        oneDark,
        customTheme,
        customSetup,
        languageExtension,
        suggestion(fileName),
        quickEdit(fileName),
        selectionTooltip(),
        keymap.of([indentWithTab]),
        minimap(),
        indentationMarkers(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }

          const isRemoteSync = update.transactions.some((transaction) => {
            return transaction.annotation(remoteSyncAnnotation) === true;
          });

          if (isRemoteSync) {
            localDirtyRef.current = false;
            return;
          }

          const nextValue = update.state.doc.toString();
          const pendingRemoteValue = pendingRemoteValueRef.current;

          if (pendingRemoteValue !== null && nextValue === pendingRemoteValue) {
            lastAppliedRemoteValueRef.current = pendingRemoteValue;
            localDirtyRef.current = false;
            clearPendingRemoteUpdate();
            return;
          }

          localDirtyRef.current =
            nextValue !== lastAppliedRemoteValueRef.current;

          if (pendingRemoteValue !== null) {
            setHasPendingRemoteUpdate(true);
            return;
          }

          onChangeRef.current(nextValue);
        })
      ],
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [clearPendingRemoteUpdate, fileName, languageExtension]);

  useEffect(() => {
    const view = viewRef.current;
    const nextValue = value ?? "";

    if (!view) {
      lastAppliedRemoteValueRef.current = nextValue;
      localDirtyRef.current = false;
      clearPendingRemoteUpdate();
      return;
    }

    if (
      nextValue === lastAppliedRemoteValueRef.current &&
      pendingRemoteValueRef.current === null
    ) {
      return;
    }

    const currentValue = view.state.doc.toString();

    if (currentValue === nextValue) {
      lastAppliedRemoteValueRef.current = nextValue;
      localDirtyRef.current = false;
      clearPendingRemoteUpdate();
      return;
    }

    if (!localDirtyRef.current && currentValue === lastAppliedRemoteValueRef.current) {
      applyRemoteValue(nextValue);
      return;
    }

    setPendingRemoteValue(nextValue);
  }, [applyRemoteValue, clearPendingRemoteUpdate, setPendingRemoteValue, value]);

  return (
    <div className="flex size-full min-h-0 flex-col bg-background">
      {hasPendingRemoteUpdate && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          <span>
            Chatbot updated this file. Reload to view the latest saved version.
            Autosave is paused until you resolve the mismatch.
          </span>
          <Button
            size="xs"
            variant="outline"
            className="h-7 gap-1.5"
            onClick={reloadLatestSavedVersion}
          >
            <RefreshCwIcon className="size-3" />
            Reload
          </Button>
        </div>
      )}
      <div ref={editorRef} className="min-h-0 flex-1 pl-4" />
    </div>
  );
};
