"use client";

import { useChat } from "@ai-sdk/react";
import { isReasoningUIPart, isTextUIPart, type SourceUrlUIPart } from "ai";
import { useGeolocation } from "@/hooks/use-geolocation";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@repo/ui/components/ai/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@repo/ui/components/ai/conversation";
import { Shimmer } from "@repo/ui/components/ai/shimmer";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@repo/ui/components/ai/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@repo/ui/components/ai/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@repo/ui/components/ai/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@repo/ui/components/ai/sources";
import { Suggestion, Suggestions } from "@repo/ui/components/ai/suggestion";
import { BotIcon } from "lucide-react";

const SUGGESTIONS = [
  "What can you help me with?",
  "Explain how LangGraph works",
  "Search my knowledge base",
  "Write me a code example",
];

export function Chat() {
  const { coords } = useGeolocation();
  const { messages, sendMessage, stop, status } = useChat({
    body: coords ? { lat: coords.lat, lng: coords.lng } : undefined,
  });

  const isLoading = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const showLoader =
    isLoading &&
    (!lastMessage ||
      lastMessage.role !== "assistant" ||
      !lastMessage.parts.some(isTextUIPart));

  return (
    <div className="flex h-dvh flex-col">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <div className="flex size-full flex-col items-center justify-center gap-4 p-8 text-center">
              <BotIcon className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <h2 className="font-semibold text-lg">How can I help you?</h2>
                <p className="text-muted-foreground text-sm">
                  Ask anything or pick a suggestion below.
                </p>
              </div>
              <Suggestions>
                {SUGGESTIONS.map((s) => (
                  <Suggestion
                    key={s}
                    suggestion={s}
                    onClick={(text) => sendMessage({ text })}
                  />
                ))}
              </Suggestions>
            </div>
          ) : (
            messages.map((msg) => {
              const textParts = msg.parts.filter(isTextUIPart);
              const reasoningParts = msg.parts.filter(isReasoningUIPart);
              const sourceParts = msg.parts.filter(
                (p): p is SourceUrlUIPart => p.type === "source-url",
              );
              const fileParts = msg.parts.filter(
                (p) => p.type === "file",
              ) as { type: "file"; url: string; mediaType: string; filename?: string }[];

              const isStreamingThis =
                isLoading && msg === lastMessage && msg.role === "assistant";
              const text = textParts.map((p) => p.text).join("");

              return (
                <Message key={msg.id} from={msg.role}>
                  {/* File attachments on user messages */}
                  {fileParts.length > 0 && (
                    <Attachments variant="inline" className="ml-auto">
                      {fileParts.map((f, i) => (
                        <Attachment
                          key={i}
                          data={{
                            id: String(i),
                            type: "file",
                            filename: f.filename,
                            url: f.url,
                            mediaType: f.mediaType,
                          }}
                        >
                          <AttachmentPreview />
                        </Attachment>
                      ))}
                    </Attachments>
                  )}

                  <MessageContent>
                    {/* Reasoning block */}
                    {reasoningParts.length > 0 && (
                      <Reasoning isStreaming={isStreamingThis}>
                        <ReasoningTrigger />
                        <ReasoningContent>
                          {reasoningParts.map((p) => p.text).join("")}
                        </ReasoningContent>
                      </Reasoning>
                    )}

                    {/* Text content */}
                    {text &&
                      (msg.role === "assistant" ? (
                        <MessageResponse>{text}</MessageResponse>
                      ) : (
                        <p className="whitespace-pre-wrap">{text}</p>
                      ))}

                    {/* Sources */}
                    {sourceParts.length > 0 && (
                      <Sources>
                        <SourcesTrigger count={sourceParts.length} />
                        <SourcesContent>
                          {sourceParts.map((p) => (
                            <Source key={p.sourceId} href={p.url} title={p.title} />
                          ))}
                        </SourcesContent>
                      </Sources>
                    )}
                  </MessageContent>
                </Message>
              );
            })
          )}

          {/* Loading indicator while waiting for first token */}
          {showLoader && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking...</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        <PromptInput
          onSubmit={({ text, files }) => sendMessage({ text, files })}
          multiple
          globalDrop
        >
          {/* Pending attachment previews */}
          <PromptInputAttachments>
            {(file) => (
              <Attachment
                data={{
                  id: file.id,
                  type: "file",
                  filename: file.filename,
                  url: file.url,
                  mediaType: file.mediaType,
                }}
              >
                <AttachmentPreview />
                <AttachmentRemove />
              </Attachment>
            )}
          </PromptInputAttachments>

          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask anything… (Enter to send)" />
          </PromptInputBody>

          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit status={status} onClick={isLoading ? stop : undefined} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
