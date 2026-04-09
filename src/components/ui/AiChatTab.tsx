"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Send, Plus, MessageSquare, Sparkles, Bot } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  clientName: string;
}

interface Chat {
  id: string;
  title: string;
  createdAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// ─── Styles ─────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

// ─── Suggested Questions ────────────────────────────────────────────

const suggestedQuestions = [
  "תנתח את ביצועי החודש",
  "תן המלצות לשיפור",
  "תכין סיכום שבועי ללקוח",
  "תציע רעיונות לקרייאיטיבים",
  "תכתוב טקסט למודעה חדשה",
  "מה ההבדל בין החודש הזה לקודם?",
];

// ─── Component ──────────────────────────────────────────────────────

export default function AiChatTab({ clientId, clientName }: Props) {
  const { data: session } = useSession();

  // חלונית צד — רשימת שיחות
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // הודעות של השיחה הנוכחית
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── טעינת רשימת שיחות ─────────────────────────────────────────

  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/chats?clientId=${clientId}`);
      const data = await res.json();
      setChats(data);
    } catch {
      // שגיאה בטעינת שיחות
    }
  }, [clientId]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // ─── טעינת הודעות שיחה ─────────────────────────────────────────

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/ai/chats/${chatId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch {
      // שגיאה בטעינת הודעות
    }
  }, []);

  const selectChat = useCallback(
    (chatId: string) => {
      setSelectedChatId(chatId);
      setMessages([]);
      setStreamingText("");
      loadMessages(chatId);
    },
    [loadMessages]
  );

  // ─── גלילה אוטומטית ────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // ─── שליחת הודעה + סטרימינג ────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");
      setIsLoading(true);
      setStreamingText("");

      let activeChatId = selectedChatId;

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: activeChatId,
            clientId,
            message: text.trim(),
          }),
        });

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.chatId && !activeChatId) {
                activeChatId = data.chatId;
                setSelectedChatId(data.chatId);
                fetchChats();
              }

              if (data.text) {
                setStreamingText((prev) => prev + data.text);
              }

              if (data.done) {
                // סיום — נוסיף את ההודעה הסופית לרשימה
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: data.fullText || "",
                    createdAt: new Date().toISOString(),
                  },
                ]);
                setStreamingText("");
              }
            } catch {
              // שורה לא תקינה — מדלגים
            }
          }
        }
      } catch {
        // שגיאת רשת
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, selectedChatId, clientId, fetchChats]
  );

  // ─── שיחה חדשה ─────────────────────────────────────────────────

  const startNewChat = useCallback(async () => {
    setSelectedChatId(null);
    setMessages([]);
    setStreamingText("");
    inputRef.current?.focus();
  }, []);

  // ─── שליחה עם Enter ────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  // ─── פורמט תאריך ───────────────────────────────────────────────

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  };

  // ─── האם להציג שאלות מוצעות ────────────────────────────────────

  const showSuggestions = !selectedChatId && messages.length === 0;

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-lg border border-brand-border bg-white" dir="rtl">
      {/* ── סיידבר שמאלי (ב-RTL = שמאל) — רשימת שיחות ── */}
      <aside className="flex w-64 flex-col border-l border-brand-border bg-brand-bg/50">
        {/* כפתור שיחה חדשה */}
        <button
          onClick={startNewChat}
          className="m-3 flex items-center justify-center gap-2 rounded-lg bg-brand-gold px-3 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
        >
          <Plus size={16} />
          שיחה חדשה
        </button>

        {/* רשימת שיחות */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {chats.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-brand-muted">
              אין שיחות עדיין
            </p>
          )}
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => selectChat(chat.id)}
              className={`mb-1 flex w-full items-start gap-2 rounded-lg px-3 py-2 text-right text-sm transition-colors duration-200 ${
                selectedChatId === chat.id
                  ? "bg-brand-gold/20 text-brand-dark"
                  : "text-brand-muted hover:bg-brand-light"
              }`}
            >
              <MessageSquare size={14} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{chat.title}</p>
                <p className="text-[11px] text-brand-muted">
                  {formatDate(chat.createdAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── אזור ראשי — הודעות + קלט ── */}
      <main className="flex flex-1 flex-col">
        {/* כותרת */}
        <div className="flex items-center gap-2 border-b border-brand-border px-4 py-3">
          <Bot size={18} className="text-brand-gold" />
          <span className="text-sm font-medium text-brand-dark">
            צ׳אט AI — {clientName}
          </span>
        </div>

        {/* הודעות */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* שאלות מוצעות */}
          {showSuggestions && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Sparkles size={32} className="text-brand-gold" />
              <p className="text-sm text-brand-muted">
                איך אפשר לעזור עם {clientName}?
              </p>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-full border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-dark transition-colors duration-200 hover:bg-brand-gold/10 cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* רשימת הודעות */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`mb-3 flex ${
                msg.role === "user" ? "justify-start" : "justify-end"
              }`}
            >
              <div
                className={`rounded-lg p-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-brand-gold/20 text-brand-dark mr-auto"
                    : "bg-brand-bg text-brand-dark ml-auto"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* הודעת סטרימינג */}
          {streamingText && (
            <div className="mb-3 flex justify-end">
              <div className="rounded-lg bg-brand-bg p-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap ml-auto text-brand-dark">
                {streamingText}
              </div>
            </div>
          )}

          {/* אנימציית טעינה — 3 נקודות */}
          {isLoading && !streamingText && (
            <div className="mb-3 flex justify-end">
              <div className="rounded-lg bg-brand-bg p-3 ml-auto flex items-center gap-1">
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-brand-muted [animation-delay:0ms]" />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-brand-muted [animation-delay:150ms]" />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-brand-muted [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* שורת קלט */}
        <div className="border-t border-brand-border p-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="כתוב הודעה..."
              className={inputClass}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage(inputValue)}
              disabled={isLoading || !inputValue.trim()}
              className="rounded-lg bg-brand-gold p-2 text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
