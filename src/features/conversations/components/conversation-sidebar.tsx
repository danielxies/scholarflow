"use client";

import ky from "ky";
import { toast } from "sonner";
import { useState, useRef, memo } from "react";
import {
  CopyIcon,
  HistoryIcon,
  LoaderIcon,
  PlusIcon,
  SendIcon,
  PaperclipIcon,
  XIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";

import {
  useConversation,
  useConversations,
  useCreateConversation,
  useMessages,
} from "../hooks/use-conversations";
import { useConversationStore } from "../store/use-conversation-store";

import { Id } from "@/lib/local-db/types";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { PastConversationsDialog } from "./past-conversations-dialog";
import { ToolCallBlock, stripToolCallArtifacts, parseToolCalls } from "./tool-call-block";

const MarkdownResponse = memo(
  ({ children }: { children: string }) => (
    <Streamdown
      shikiTheme={["one-dark-pro", "one-light"]}
      className="scholarflow-prose size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>div]:bg-accent [&>div]:rounded-md"
    >
      {children}
    </Streamdown>
  ),
  (prev, next) => prev.children === next.children
);
MarkdownResponse.displayName = "MarkdownResponse";

interface ConversationSidebarProps {
  projectId: Id<"projects">;
}

export const ConversationSidebar = ({
  projectId,
}: ConversationSidebarProps) => {
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [
    pastConversationsOpen,
    setPastConversationsOpen
  ] = useState(false);

  const createConversation = useCreateConversation();
  const conversations = useConversations(projectId);
  const selectedConversationId = useConversationStore((state) =>
    state.getSelectedConversationId(projectId)
  );
  const setSelectedConversationId = useConversationStore(
    (state) => state.setSelectedConversationId
  );

  const activeConversationId =
    selectedConversationId ?? conversations?.[0]?._id ?? null;

  const activeConversation = useConversation(activeConversationId);
  const conversationMessages = useMessages(activeConversationId);

  const isProcessing = streamingText !== null || conversationMessages?.some(
    (msg) => msg.status === "processing"
  );

  const handleCancel = async () => {
    // Abort streaming request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setStreamingText(null);
    }
    try {
      await ky.post("/api/messages/cancel", {
        json: { projectId },
      });
    } catch {
      // ignore
    }
  };

  const handleCreateConversation = async () => {
    try {
      const newConversationId = await createConversation({
        projectId,
        title: DEFAULT_CONVERSATION_TITLE,
      });
      setSelectedConversationId(projectId, newConversationId as Id<"conversations">);
      return newConversationId;
    } catch {
      toast.error("Unable to create new conversation");
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isProcessing && !input.trim()) {
      await handleCancel();
      return;
    }

    if (!input.trim()) return;

    let conversationId = activeConversationId;

    if (!conversationId) {
      conversationId = await handleCreateConversation();
      if (!conversationId) return;
    }

    const messageText = input.trim();
    setInput("");
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/messages/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: messageText }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        toast.error("Message failed to send");
        setStreamingText(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreamingText(acc);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error("Message failed to send");
      }
    } finally {
      setStreamingText(null);
      abortRef.current = null;
    }
  };

  return (
    <>
      <PastConversationsDialog
        projectId={projectId}
        open={pastConversationsOpen}
        onOpenChange={setPastConversationsOpen}
        onSelect={(conversationId) =>
          setSelectedConversationId(projectId, conversationId)
        }
      />
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="h-10 flex items-center justify-between border-b px-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-2 rounded-full bg-secondary shrink-0" />
            <span className="text-sm font-medium truncate">
              {activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setPastConversationsOpen(true)}
            >
              <HistoryIcon className="size-3.5" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={handleCreateConversation}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <Conversation className="flex-1">
          <ConversationContent className="gap-4 p-3">
            {conversationMessages?.map((message, messageIndex) => (
              <div key={message._id} className="flex flex-col gap-1.5">
                {message.role === "user" ? (
                  <div className="ml-auto max-w-[85%]">
                    <div className="rounded-lg bg-accent px-3.5 py-2.5 text-sm text-foreground">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    {message.status === "processing" && streamingText === null ? (
                      <div className="flex items-center gap-2 text-muted-foreground py-2">
                        <LoaderIcon className="size-3.5 animate-spin" />
                        <span className="text-xs font-mono">Processing...</span>
                        <button
                          onClick={handleCancel}
                          className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Cancel request"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                    ) : message.status === "cancelled" ? (
                      <span className="text-xs text-muted-foreground italic">
                        Request cancelled
                      </span>
                    ) : message.content ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-secondary">
                          Response
                        </span>
                        {parseToolCalls(message.content).length > 0 && (
                          <ToolCallBlock content={message.content} />
                        )}
                        <div className="rounded-md border border-border/50 bg-card p-3.5 text-[13px] leading-relaxed text-foreground break-words">
                          <MarkdownResponse>
                            {stripToolCallArtifacts(message.content)}
                          </MarkdownResponse>
                        </div>
                        {messageIndex === (conversationMessages?.length ?? 0) - 1 && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="xs"
                              variant="outline"
                              className="text-[11px] gap-1"
                              onClick={() => navigator.clipboard.writeText(
                                stripToolCallArtifacts(message.content)
                              )}
                            >
                              <CopyIcon className="size-3" />
                              Copy
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}

            {/* Streaming response */}
            {streamingText !== null && (
              <div className="flex flex-col gap-1.5">
                <div className="w-full">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-secondary">
                      Response
                    </span>
                    {streamingText && parseToolCalls(streamingText).length > 0 && (
                      <ToolCallBlock content={streamingText} />
                    )}
                    <div className="rounded-md border border-border/50 bg-card p-3.5 text-[13px] leading-relaxed text-foreground break-words">
                      {streamingText ? (
                        <MarkdownResponse>
                          {stripToolCallArtifacts(streamingText)}
                        </MarkdownResponse>
                      ) : (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <div className="flex gap-1">
                            <div className="size-1.5 rounded-full bg-secondary animate-pulse" />
                            <div className="size-1.5 rounded-full bg-secondary animate-pulse [animation-delay:150ms]" />
                            <div className="size-1.5 rounded-full bg-secondary animate-pulse [animation-delay:300ms]" />
                          </div>
                          <span className="text-xs font-mono">Analyzing research context...</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
                    >
                      <XIcon className="size-3" />
                      Stop
                    </button>
                  </div>
                </div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Input */}
        <div className="border-t p-3">
          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-2 rounded-lg border bg-card p-1.5">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="shrink-0 self-end mb-0.5"
              >
                <PaperclipIcon className="size-3.5 text-muted-foreground" />
              </Button>
              <textarea
                placeholder="Ask about your research..."
                className="flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-h-[20px] max-h-[120px] py-0.5"
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                disabled={isProcessing}
              />
              <Button
                type="submit"
                size="icon-xs"
                variant={input.trim() ? "default" : "ghost"}
                className="shrink-0 self-end mb-0.5"
                disabled={isProcessing ? false : !input.trim()}
              >
                {isProcessing ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <SendIcon className="size-3.5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};
