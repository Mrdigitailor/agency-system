"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useApp } from "@/lib/data/context";
import { Send, Plus, MessageSquare, Search } from "lucide-react";

/* ── טיפוסים ── */

interface ChatRoom {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  lastMessage: { content: string; authorName: string; createdAt: string } | null;
  unreadCount: number;
}

interface Message {
  id: string;
  content: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}

/* ── סגנונות ── */

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

/* ── עזר ── */

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/* ── קומפוננטה ראשית ── */

export default function ChatPage() {
  const { data: session } = useSession();
  const { clients } = useApp();
  const currentUserId = session?.user?.id ?? "";
  const currentUserName = session?.user?.name ?? "";

  /* ── מצב ── */
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [customChatName, setCustomChatName] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  /* ── שליפת חדרי צ׳אט ── */
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data: ChatRoom[] = await res.json();
        setChatRooms(data);
      }
    } catch {
      /* שקט */
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  /* ── שליפת הודעות ── */
  const fetchMessages = useCallback(async (roomId: string) => {
    try {
      const res = await fetch(`/api/chat/${roomId}/messages`);
      if (res.ok) {
        const data: Message[] = await res.json();
        setMessages(data);
      }
    } catch {
      /* שקט */
    }
  }, []);

  /* ── טעינה ראשונית + polling ── */
  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  useEffect(() => {
    if (!activeRoomId) return;
    setLoadingMessages(true);
    fetchMessages(activeRoomId).finally(() => setLoadingMessages(false));
    const interval = setInterval(() => fetchMessages(activeRoomId), 5000);
    return () => clearInterval(interval);
  }, [activeRoomId, fetchMessages]);

  /* ── גלילה אוטומטית ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── בחירת חדר ── */
  const selectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setMessages([]);
  };

  /* ── שליחת הודעה ── */
  const sendMessage = async () => {
    if (!messageInput.trim() || !activeRoomId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/${activeRoomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageInput.trim() }),
      });
      if (res.ok) {
        setMessageInput("");
        await fetchMessages(activeRoomId);
        await fetchRooms();
      }
    } catch {
      /* שקט */
    } finally {
      setSending(false);
    }
  };

  /* ── יצירת צ׳אט חדש ── */
  const createChat = async (payload: { clientId?: string; name?: string }) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const newRoom: ChatRoom = await res.json();
        setShowNewChat(false);
        setCustomChatName("");
        await fetchRooms();
        setActiveRoomId(newRoom.id);
      }
    } catch {
      /* שקט */
    }
  };

  /* ── סינון חדרים ── */
  const filteredRooms = chatRooms.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.clientName && r.clientName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeRoom = chatRooms.find((r) => r.id === activeRoomId);

  /* ── ממשק ── */
  return (
    <div dir="rtl" className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-brand-border bg-brand-light shadow-sm">
      {/* ── רשימת צ׳אטים (צד ימין ב-RTL) ── */}
      <div className="flex w-80 flex-shrink-0 flex-col border-l border-brand-border">
        {/* כותרת + כפתור חדש */}
        <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
          <h2 className="text-lg font-semibold text-brand-dark">צ׳אטים</h2>
          <button
            onClick={() => setShowNewChat(!showNewChat)}
            className="flex items-center gap-1 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
          >
            <Plus className="h-3.5 w-3.5" />
            צ׳אט חדש
          </button>
        </div>

        {/* דרופדאון צ׳אט חדש */}
        {showNewChat && (
          <div className="border-b border-brand-border bg-brand-bg p-3 space-y-2">
            <p className="text-xs font-medium text-brand-muted">בחר לקוח:</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {clients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => createChat({ clientId: client.id })}
                  className="block w-full rounded px-2 py-1 text-right text-sm text-brand-dark hover:bg-brand-gold/10 transition-colors duration-200"
                >
                  {client.name}
                </button>
              ))}
            </div>
            <div className="border-t border-brand-border pt-2">
              <p className="text-xs font-medium text-brand-muted mb-1">או שם מותאם:</p>
              <div className="flex gap-2">
                <input
                  value={customChatName}
                  onChange={(e) => setCustomChatName(e.target.value)}
                  placeholder="שם הצ׳אט..."
                  className={inputClass + " text-xs"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customChatName.trim()) {
                      createChat({ name: customChatName.trim() });
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (customChatName.trim()) createChat({ name: customChatName.trim() });
                  }}
                  className="rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 whitespace-nowrap"
                >
                  צור
                </button>
              </div>
            </div>
          </div>
        )}

        {/* חיפוש */}
        <div className="px-3 py-2 border-b border-brand-border">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש צ׳אט..."
              className={inputClass + " pr-8 text-xs"}
            />
          </div>
        </div>

        {/* רשימת חדרים */}
        <div className="flex-1 overflow-y-auto">
          {loadingRooms ? (
            <div className="flex items-center justify-center py-10 text-sm text-brand-muted">
              טוען...
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-brand-muted">
              אין צ׳אטים
            </div>
          ) : (
            filteredRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => selectRoom(room.id)}
                className={`block w-full px-4 py-3 text-right transition-colors duration-200 ${
                  activeRoomId === room.id
                    ? "bg-brand-gold/10 border-r-2 border-brand-gold"
                    : "hover:bg-brand-bg"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-brand-dark truncate">
                        {room.clientName || room.name}
                      </span>
                    </div>
                    {room.lastMessage && (
                      <p className="mt-0.5 text-xs text-brand-muted truncate">
                        <span className="font-medium">{room.lastMessage.authorName}:</span>{" "}
                        {truncate(room.lastMessage.content, 40)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {room.lastMessage && (
                      <span className="text-[10px] text-brand-muted">
                        {formatTime(room.lastMessage.createdAt)}
                      </span>
                    )}
                    {room.unreadCount > 0 && (
                      <span className="bg-brand-gold text-brand-dark text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                        {room.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── אזור הודעות (צד שמאל ב-RTL) ── */}
      <div className="flex flex-1 flex-col">
        {!activeRoomId ? (
          /* מצב ריק */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-brand-muted">
            <MessageSquare className="h-12 w-12 opacity-30" />
            <p className="text-sm">בחר צ׳אט או צור חדש</p>
          </div>
        ) : (
          <>
            {/* כותרת חדר */}
            <div className="flex items-center border-b border-brand-border px-5 py-3">
              <h3 className="text-base font-semibold text-brand-dark">
                {activeRoom?.clientName || activeRoom?.name || "צ׳אט"}
              </h3>
            </div>

            {/* הודעות */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
            >
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10 text-sm text-brand-muted">
                  טוען...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-brand-muted">
                  אין הודעות עדיין. שלח את ההודעה הראשונה!
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.authorId === currentUserId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2.5 ${
                          isMine
                            ? "bg-brand-gold/20 text-brand-dark"
                            : "bg-brand-bg text-brand-dark"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium">
                            {isMine ? currentUserName : msg.authorName}
                          </span>
                          <span className="text-[10px] text-brand-muted">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* שורת קלט */}
            <div className="border-t border-brand-border px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="כתוב הודעה..."
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageInput.trim() || sending}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-gold text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
