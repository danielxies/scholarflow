"use client";

import ky from "ky";
import { toast } from "sonner";
import { useState } from "react";
import {
  CopyIcon,
  HistoryIcon,
  LoaderIcon,
  PlusIcon,
  SendIcon,
  PaperclipIcon,
} from "lucide-react";

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

import { Id } from "@/lib/local-db/types";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { PastConversationsDialog } from "./past-conversations-dialog";

interface ConversationSidebarProps {
  projectId: Id<"projects">;
}

export const ConversationSidebar = ({
  projectId,
}: ConversationSidebarProps) => {
  const [input, setInput] = useState("");
  const [
    selectedConversationId,
    setSelectedConversationId,
  ] = useState<Id<"conversations"> | null>(null);
  const [
    pastConversationsOpen,
    setPastConversationsOpen
  ] = useState(false);

  const createConversation = useCreateConversation();
  const conversations = useConversations(projectId);

  const activeConversationId =
    selectedConversationId ?? conversations?.[0]?._id ?? null;

  const activeConversation = useConversation(activeConversationId);
  const conversationMessages = useMessages(activeConversationId);

  const isProcessing = conversationMessages?.some(
    (msg) => msg.status === "processing"
  );

  const handleCancel = async () => {
    try {
      await ky.post("/api/messages/cancel", {
        json: { projectId },
      });
    } catch {
      toast.error("Unable to cancel request");
    }
  };

  const handleCreateConversation = async () => {
    try {
      const newConversationId = await createConversation({
        projectId,
        title: DEFAULT_CONVERSATION_TITLE,
      });
      setSelectedConversationId(newConversationId);
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

    try {
      await ky.post("/api/messages", {
        json: {
          conversationId,
          message: input.trim(),
        },
      });
    } catch {
      toast.error("Message failed to send");
    }

    setInput("");
  };

  return (
    <>
      <PastConversationsDialog
        projectId={projectId}
        open={pastConversationsOpen}
        onOpenChange={setPastConversationsOpen}
        onSelect={setSelectedConversationId}
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
                  /* User message — dark bubble */
                  <div className="ml-auto max-w-[85%]">
                    <div className="rounded-lg bg-accent px-3.5 py-2.5 text-sm text-foreground">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  /* Assistant message — research response style */
                  <div className="w-full">
                    {message.status === "processing" ? (
                      <div className="flex items-center gap-2 text-muted-foreground py-2">
                        <LoaderIcon className="size-3.5 animate-spin" />
                        <span className="text-xs font-mono">Processing...</span>
                      </div>
                    ) : message.status === "cancelled" ? (
                      <span className="text-xs text-muted-foreground italic">
                        Request cancelled
                      </span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {/* Response label */}
                        <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-secondary">
                          // Response
                        </span>
                        {/* Response body */}
                        <div className="rounded-md border border-border/50 bg-card p-3.5 text-[13px] leading-relaxed font-mono text-foreground whitespace-pre-wrap break-words">
                          {message.content}
                        </div>
                        {/* Actions */}
                        {messageIndex === (conversationMessages?.length ?? 0) - 1 && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="xs"
                              variant="outline"
                              className="text-[11px] gap-1"
                              onClick={() => navigator.clipboard.writeText(message.content)}
                            >
                              <CopyIcon className="size-3" />
                              Copy
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
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
