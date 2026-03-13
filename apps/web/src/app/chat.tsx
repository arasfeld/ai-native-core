"use client";

import { useChat } from "@ai-sdk/react";
import {
  Attachment,
  AttachmentLightbox,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@repo/ui/components/ai/attachments";
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@repo/ui/components/ai/confirmation";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@repo/ui/components/ai/conversation";
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
import { Shimmer } from "@repo/ui/components/ai/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@repo/ui/components/ai/sources";
import { Suggestion, Suggestions } from "@repo/ui/components/ai/suggestion";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@repo/ui/components/ai/tool";
import {
  DefaultChatTransport,
  isReasoningUIPart,
  isTextUIPart,
  type SourceUrlUIPart,
  type ToolInvocationUIPart,
} from "ai";
import { BotIcon } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { UserMenu } from "@/components/user-menu";
import { useGeolocation } from "@/hooks/use-geolocation";

const SUGGESTIONS = [
  "What can you help me with?",
  "Explain how LangGraph works",
  "Search my knowledge base",
  "Write me a code example",
];

export function Chat(): ReactNode {
  const [inputText, setInputText] = useState("");
  const { coords } = useGeolocation();
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        credentials: "include",
        body: () => coordsRef.current ?? {},
      }),
  );
  const { messages, sendMessage, stop, status, addToolResult } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const showLoader =
    isLoading &&
    (!lastMessage ||
      lastMessage.role !== "assistant" ||
      lastMessage.parts.length === 0);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <BotIcon className="size-4 text-muted-foreground" />
          AI Native
        </div>
        <UserMenu />
      </header>
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
              const toolParts = msg.parts.filter(
                (p): p is ToolInvocationUIPart => p.type === "tool-invocation",
              );
              const fileParts = msg.parts.filter((p) => p.type === "file") as {
                type: "file";
                url: string;
                mediaType: string;
                filename?: string;
              }[];

              const isStreamingThis =
                isLoading && msg === lastMessage && msg.role === "assistant";
              const lastPart = msg.parts[msg.parts.length - 1];
              const isReasoningStreaming =
                isStreamingThis && lastPart && isReasoningUIPart(lastPart);
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
                          <AttachmentLightbox>
                            <AttachmentPreview />
                          </AttachmentLightbox>
                        </Attachment>
                      ))}
                    </Attachments>
                  )}

                  <MessageContent>
                    {/* Reasoning block */}
                    {reasoningParts.length > 0 && (
                      <Reasoning isStreaming={isReasoningStreaming}>
                        <ReasoningTrigger />
                        <ReasoningContent>
                          {reasoningParts.map((p) => p.text).join("")}
                        </ReasoningContent>
                      </Reasoning>
                    )}

                    {/* Text content */}
                    {msg.role === "assistant" ? (
                      (text || (isStreamingThis && !isReasoningStreaming)) && (
                        <MessageResponse isStreaming={isStreamingThis}>
                          {text}
                        </MessageResponse>
                      )
                    ) : (
                      <p className="whitespace-pre-wrap">{text}</p>
                    )}

                    {/* Tool Invocations */}
                    {toolParts.map((part) => {
                      const { toolCallId, toolName, state } =
                        part.toolInvocation;

                      // If it's an approval request, show confirmation UI
                      // @ts-expect-error state only available in AI SDK v6
                      if (state === "approval-requested") {
                        return (
                          <Confirmation key={toolCallId} state={state} approval={{ id: toolCallId }}>
                            <ConfirmationTitle>
                              Execute {toolName}?
                            </ConfirmationTitle>
                            <ConfirmationRequest>
                              <ConfirmationActions>
                                <ConfirmationAction
                                  variant="outline"
                                  onClick={() =>
                                    addToolResult({
                                      toolCallId,
                                      result: "denied",
                                    })
                                  }
                                >
                                  Reject
                                </ConfirmationAction>
                                <ConfirmationAction
                                  onClick={() =>
                                    addToolResult({
                                      toolCallId,
                                      result: "approved",
                                    })
                                  }
                                >
                                  Approve
                                </ConfirmationAction>
                              </ConfirmationActions>
                            </ConfirmationRequest>
                            <ConfirmationAccepted>
                              You approved this action.
                            </ConfirmationAccepted>
                            <ConfirmationRejected>
                              You rejected this action.
                            </ConfirmationRejected>
                          </Confirmation>
                        );
                      }

                      // Otherwise show standard tool status/input/output
                      return (
                        <Tool key={toolCallId}>
                          <ToolHeader
                            title={toolName}
                            type="tool-invocation"
                            state={state}
                          />
                          <ToolContent>
                            <ToolInput input={part.toolInvocation.args} />
                            {"result" in part.toolInvocation && (
                              <ToolOutput
                                output={part.toolInvocation.result}
                                errorText={undefined}
                              />
                            )}
                          </ToolContent>
                        </Tool>
                      );
                    })}

                    {/* Sources */}
                    {sourceParts.length > 0 && (
                      <Sources>
                        <SourcesTrigger count={sourceParts.length} />
                        <SourcesContent>
                          {sourceParts.map((p) => (
                            <Source
                              key={p.sourceId}
                              href={p.url}
                              title={p.title}
                            />
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
          onSubmit={({ text, files }) => {
            sendMessage({ text, files });
            setInputText("");
          }}
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
            <PromptInputTextarea
              placeholder="Ask anything… (Enter to send)"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
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
            <PromptInputSubmit
              status={status}
              disabled={!isLoading && inputText.trim() === ""}
              onClick={isLoading ? stop : undefined}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
