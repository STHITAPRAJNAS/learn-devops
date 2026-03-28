"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; args: Record<string, unknown> }[];
  timestamp: Date;
}

interface AiTutorProps {
  initialPrompt?: string;
  lessonContext?: string;
}

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

// Suggested quick prompts
const QUICK_PROMPTS = [
  "Explain Kubernetes Network Policies with examples",
  "How does Istio mTLS work in production?",
  "Quiz me on Helm advanced patterns",
  "What's the difference between MetalLB L2 and BGP mode?",
  "Review this YAML and suggest improvements",
  "Create a learning path for CKA certification",
];

export default function AiTutor({ initialPrompt, lessonContext }: AiTutorProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "👋 I'm **DevOps Sensei** — your AI tutor for Docker, Kubernetes, Helm, and enterprise cloud-native infrastructure.\n\n" +
        "I can:\n" +
        "- **Teach** any lesson interactively with real examples\n" +
        "- **Quiz** you to test your knowledge\n" +
        "- **Validate** your Kubernetes YAML manifests\n" +
        "- **Guide** you with a personalized learning path\n" +
        "- **Assign** hands-on lab exercises\n\n" +
        "What would you like to learn today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState(initialPrompt || "");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const sendMessage = useCallback(
    async (messageText?: string) => {
      const text = (messageText || input).trim();
      if (!text || isLoading) return;

      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      // Prepare context-aware message
      const fullMessage = lessonContext
        ? `[Context: Currently viewing lesson about ${lessonContext}]\n\n${text}`
        : text;

      // Streaming response
      const assistantId = uuidv4();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
      ]);
      setIsStreaming(true);

      try {
        const url = new URL(`${AGENT_API}/chat/stream`);
        url.searchParams.set("message", fullMessage);
        url.searchParams.set("session_id", sessionId);
        url.searchParams.set("user_id", "web-user");

        const eventSource = new EventSource(url.toString());
        let accumulated = "";

        eventSource.onmessage = (event) => {
          if (event.data === "[DONE]") {
            eventSource.close();
            setIsLoading(false);
            setIsStreaming(false);
            return;
          }
          accumulated += event.data;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m
            )
          );
        };

        eventSource.onerror = () => {
          eventSource.close();
          // Fallback to non-streaming
          fetchNonStreaming(fullMessage, assistantId);
        };
      } catch {
        fetchNonStreaming(fullMessage, assistantId);
      }
    },
    [input, isLoading, lessonContext, sessionId]
  );

  const fetchNonStreaming = async (text: string, assistantId: string) => {
    try {
      const res = await fetch(`${AGENT_API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId, user_id: "web-user" }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: data.response, toolCalls: data.tool_calls }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "⚠️ Failed to reach the AI tutor. Make sure the agent server is running (`cd agent && python main.py`)." }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessageContent = (content: string) => {
    // Simple markdown-like rendering for code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const lines = part.slice(3, -3).split("\n");
        const lang = lines[0].trim();
        const code = lines.slice(1).join("\n");
        return (
          <div key={i} className="my-3 rounded-lg overflow-hidden border border-gray-700">
            {lang && (
              <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 border-b border-gray-700">
                <span className="text-xs text-gray-400 font-mono">{lang}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Copy
                </button>
              </div>
            )}
            <pre className="p-4 bg-gray-900 overflow-x-auto text-sm">
              <code className="text-green-300 font-mono">{code}</code>
            </pre>
          </div>
        );
      }
      // Render bold, inline code, and newlines
      return (
        <span key={i}>
          {part
            .split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g)
            .map((chunk, j) => {
              if (chunk.startsWith("**") && chunk.endsWith("**")) {
                return <strong key={j} className="font-semibold text-white">{chunk.slice(2, -2)}</strong>;
              }
              if (chunk.startsWith("`") && chunk.endsWith("`")) {
                return <code key={j} className="px-1 py-0.5 bg-gray-800 rounded text-green-300 text-sm font-mono">{chunk.slice(1, -1)}</code>;
              }
              if (chunk === "\n") return <br key={j} />;
              return chunk;
            })}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
          AI
        </div>
        <div>
          <h3 className="font-semibold text-white text-sm">DevOps Sensei</h3>
          <p className="text-xs text-gray-400">Powered by Google ADK + Gemini</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isStreaming ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
          <span className="text-xs text-gray-400">{isStreaming ? "thinking..." : "ready"}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gradient-to-br from-purple-600 to-blue-600 text-white"
              }`}
            >
              {msg.role === "user" ? "U" : "AI"}
            </div>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-gray-800 text-gray-100 rounded-tl-sm"
              }`}
            >
              {msg.content ? (
                <div>{renderMessageContent(msg.content)}</div>
              ) : (
                <div className="flex gap-1 items-center py-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">Tools used:</p>
                  {msg.toolCalls.map((tc, i) => (
                    <span key={i} className="inline-block text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded mr-1 mb-1">
                      {tc.tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500 mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => sendMessage(prompt)}
                className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full border border-gray-700 hover:border-gray-600 transition-all"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 bg-gray-900 border-t border-gray-800">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about Docker, Kubernetes, Helm... or paste YAML to review"
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700 min-h-[42px] max-h-[200px]"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">Shift+Enter for new line · Enter to send</p>
      </div>
    </div>
  );
}
