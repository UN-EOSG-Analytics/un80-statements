"use client";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { CopyIcon, RefreshCcwIcon, SettingsIcon } from "lucide-react";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Loader } from "@/components/ai-elements/loader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";

const ChatBotDemo = () => {
  const [input, setInput] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chat_authenticated") === "true";
    }
    return false;
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const { messages, sendMessage, status, regenerate } = useChat();

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      password === process.env.NEXT_PUBLIC_CHAT_PASSWORD ||
      password === "un80chat"
    ) {
      setIsAuthenticated(true);
      localStorage.setItem("chat_authenticated", "true");
      setError("");
    } else {
      setError("Incorrect password");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Chat Access</CardTitle>
            <CardDescription>Enter password to access the chat</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full"
                />
                {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
              </div>
              <Button type="submit" className="w-full">
                Enter
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);
    if (!(hasText || hasAttachments)) {
      return;
    }
    sendMessage(
      {
        text: message.text || "Sent with attachments",
        files: message.files,
      },
      {
        body: {
          model: "claude-sonnet-4-5",
          systemPrompt: systemPrompt,
        },
      },
    );
    setInput("");
  };
  return (
    <>
      <header className="fixed top-0 right-0 left-0 z-20 border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-4 sm:px-6">
          <h1 className="text-4xl text-gray-800">
            <span className="font-bold">UN80</span>Chat
          </h1>
          <Badge
            variant="secondary"
            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
          >
            alpha
          </Badge>
        </div>
      </header>

      <div className="relative mx-auto size-full min-h-screen max-w-6xl px-4 pt-24 sm:px-6">
        <div className="flex flex-col pb-48">
          <div className="space-y-4 pb-8">
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === "assistant" &&
                  message.parts.filter((part) => part.type === "source-url")
                    .length > 0 && (
                    <Sources>
                      <SourcesTrigger
                        count={
                          message.parts.filter(
                            (part) => part.type === "source-url",
                          ).length
                        }
                      />
                      {message.parts
                        .filter((part) => part.type === "source-url")
                        .map((part, i) => (
                          <SourcesContent key={`${message.id}-${i}`}>
                            <Source
                              key={`${message.id}-${i}`}
                              href={part.url}
                              title={part.url}
                            />
                          </SourcesContent>
                        ))}
                    </Sources>
                  )}
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text":
                      return (
                        <Message key={`${message.id}-${i}`} from={message.role}>
                          <MessageContent>
                            <MessageResponse>{part.text}</MessageResponse>
                          </MessageContent>
                          {message.role === "assistant" &&
                            i === messages.length - 1 && (
                              <MessageActions>
                                <MessageAction
                                  onClick={() => regenerate()}
                                  label="Retry"
                                >
                                  <RefreshCcwIcon className="size-3" />
                                </MessageAction>
                                <MessageAction
                                  onClick={() =>
                                    navigator.clipboard.writeText(part.text)
                                  }
                                  label="Copy"
                                >
                                  <CopyIcon className="size-3" />
                                </MessageAction>
                              </MessageActions>
                            )}
                        </Message>
                      );
                    case "reasoning":
                      return (
                        <Reasoning
                          key={`${message.id}-${i}`}
                          className="w-full"
                          isStreaming={
                            status === "streaming" &&
                            i === message.parts.length - 1 &&
                            message.id === messages.at(-1)?.id
                          }
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    default:
                      return null;
                  }
                })}
              </div>
            ))}
            {status === "submitted" && <Loader />}
          </div>
          <div className="fixed right-0 bottom-0 left-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
              <PromptInput onSubmit={handleSubmit} globalDrop multiple>
                <PromptInputHeader>
                  <PromptInputAttachments>
                    {(attachment) => (
                      <PromptInputAttachment data={attachment} />
                    )}
                  </PromptInputAttachments>
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    placeholder="Ask about any UN80 transcripts..."
                    data-1p-ignore
                    data-lpignore="true"
                    className="!py-2 focus-visible:ring-0 focus-visible:ring-offset-0"
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
                    <Badge variant="outline" className="text-xs">
                      Claude Sonnet 4.5
                    </Badge>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-un-blue"
                        >
                          <SettingsIcon className="size-3" />
                          System
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>System Prompt</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            placeholder="Enter system prompt..."
                            className="min-h-[200px] resize-y focus-visible:ring-un-blue"
                            data-1p-ignore
                            data-lpignore="true"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
                            }
                            className="w-full hover:bg-un-blue/5 hover:text-un-blue"
                          >
                            Reset to Default
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </PromptInputTools>
                  <PromptInputSubmit
                    disabled={!input && !status}
                    status={status}
                    className="bg-un-blue text-white hover:bg-un-blue/90"
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
export default ChatBotDemo;
