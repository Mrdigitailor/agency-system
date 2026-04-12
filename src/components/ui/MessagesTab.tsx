"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  MessageSquare,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Send,
  Loader2,
} from "lucide-react";

interface Props {
  clientId: string;
}

type TabType = "fb_messages" | "fb_comments" | "ig_comments";

interface ApiResponse {
  data: any[];
  error?: string;
  permissionError?: string;
}

const TABS: { key: TabType; label: string }[] = [
  { key: "fb_messages", label: "הודעות פייסבוק" },
  { key: "fb_comments", label: "תגובות פייסבוק" },
  { key: "ig_comments", label: "תגובות אינסטגרם" },
];

const REPLY_ALLOWED_ROLES = new Set(["admin", "manager", "campaignManager"]);

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string | undefined | null, max = 60): string {
  if (!text) return "—";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export default function MessagesTab({ clientId }: Props) {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? "";
  const canReply = REPLY_ALLOWED_ROLES.has(userRole);

  const [activeTab, setActiveTab] = useState<TabType>("fb_messages");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | "organic" | "ad">("all");

  // טעינה ראשונית — מ-cache (מהיר)
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionError(null);
    setExpandedConversation(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/messages?type=${activeTab}`);
      const json: ApiResponse & { lastSyncAt?: string | null } = await res.json();
      if (json.permissionError) {
        setPermissionError(json.permissionError);
        setData([]);
      } else if (json.error) {
        setError(json.error);
        setData([]);
      } else {
        setData(json.data ?? []);
        setLastSyncAt(json.lastSyncAt ?? null);
      }
    } catch {
      setError("שגיאה בטעינת הנתונים");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, activeTab]);

  // רענון ידני — מבצע sync ואז קורא מהצד
  const refreshFromApi = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setPermissionError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/messages?type=${activeTab}`, {
        method: "POST",
      });
      const json: ApiResponse & { lastSyncAt?: string | null } = await res.json();
      if (json.permissionError) {
        setPermissionError(json.permissionError);
      } else if (json.error) {
        setError(json.error);
      } else {
        setData(json.data ?? []);
        setLastSyncAt(json.lastSyncAt ?? new Date().toISOString());
      }
    } catch {
      setError("שגיאה בסנכרון");
    } finally {
      setSyncing(false);
    }
  }, [clientId, activeTab]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const toggleConversation = (id: string) => {
    setExpandedConversation((prev) => (prev === id ? null : id));
  };

  /**
   * שליחת תגובה — מחזיר Promise<boolean> (true = הצליח)
   */
  async function sendReply(type: "fb_comment" | "fb_message" | "ig_comment", targetId: string, message: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/clients/${clientId}/messages/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetId, message }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        alert(`שגיאה: ${json.error ?? "נכשלה השליחה"}`);
        return false;
      }
      return true;
    } catch {
      alert("שגיאה ברשת");
      return false;
    }
  }

  /**
   * עדכון אופטימי — מוסיף תגובה לרשימה לפני רענון
   */
  function appendOptimisticReply(type: TabType, targetId: string, message: string) {
    const now = new Date().toISOString();
    if (type === "fb_comments") {
      // לתגובת פייסבוק — מוסיף תגובה משנה לתגובה המקורית
      setData((prev) =>
        prev.map((c: any) =>
          c.id === targetId
            ? {
                ...c,
                replies: [...(c.replies ?? []), { id: `optimistic_${Date.now()}`, message, from: { name: "אתם" }, created_time: now, _own: true }],
              }
            : c
        )
      );
    } else if (type === "fb_messages") {
      // הודעת פייסבוק — מוסיפה ל-conversation הנוכחי
      setData((prev) =>
        prev.map((conv: any) =>
          conv.id === targetId
            ? {
                ...conv,
                messages: {
                  data: [
                    { id: `optimistic_${Date.now()}`, message, from: { name: "אתם" }, created_time: now, _own: true },
                    ...(conv.messages?.data ?? []),
                  ],
                },
              }
            : conv
        )
      );
    } else if (type === "ig_comments") {
      setData((prev) =>
        prev.map((c: any) =>
          c.id === targetId
            ? {
                ...c,
                replies: [...(c.replies ?? []), { id: `optimistic_${Date.now()}`, text: message, from: { username: "אתם" }, timestamp: now, _own: true }],
              }
            : c
        )
      );
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Tabs + Refresh */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
              activeTab === tab.key
                ? "bg-brand-gold text-brand-dark"
                : "bg-brand-bg text-brand-muted hover:text-brand-dark"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={refreshFromApi}
          disabled={syncing || loading}
          className="p-2 rounded-full bg-brand-bg text-brand-muted hover:text-brand-dark transition-colors duration-200 disabled:opacity-50"
          title="סנכרן מ-Meta"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        </button>
        {activeTab === "fb_comments" && (
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as "all" | "organic" | "ad")}
            className="rounded-full bg-brand-bg px-3 py-2 text-xs text-brand-dark border border-brand-border focus:border-brand-gold focus:outline-none"
          >
            <option value="all">הכל</option>
            <option value="organic">אורגני בלבד</option>
            <option value="ad">מודעות בלבד</option>
          </select>
        )}
        {lastSyncAt && (
          <span className="text-xs text-brand-muted">
            סנכרון: {new Date(lastSyncAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {permissionError && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-yellow-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">נדרשת הרשאה נוספת: {permissionError}</p>
            <p className="text-sm mt-1">יש להתנתק מ-Meta ולחבר מחדש כדי לקבל את ההרשאה.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading && <p className="text-center text-brand-muted py-8">טוען הודעות...</p>}

      {!loading && !error && !permissionError && data.length === 0 && (
        <div className="text-center text-brand-muted py-12 space-y-2">
          <MessageSquare className="w-10 h-10 mx-auto opacity-40" />
          <p>אין הודעות</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm overflow-hidden">
          {activeTab === "fb_messages" && (
            <FbMessagesView
              data={data}
              expandedId={expandedConversation}
              onToggle={toggleConversation}
              canReply={canReply}
              onReply={async (convId, msg) => {
                const ok = await sendReply("fb_message", convId, msg);
                if (ok) appendOptimisticReply("fb_messages", convId, msg);
                return ok;
              }}
            />
          )}
          {activeTab === "fb_comments" && (
            <FbCommentsList
              data={sourceFilter === "all" ? data : data.filter((c: any) => c.source === sourceFilter)}
              canReply={canReply}
              onReply={async (commentId, msg) => {
                const ok = await sendReply("fb_comment", commentId, msg);
                if (ok) appendOptimisticReply("fb_comments", commentId, msg);
                return ok;
              }}
            />
          )}
          {activeTab === "ig_comments" && (
            <IgCommentsList
              data={data}
              canReply={canReply}
              onReply={async (commentId, msg) => {
                const ok = await sendReply("ig_comment", commentId, msg);
                if (ok) appendOptimisticReply("ig_comments", commentId, msg);
                return ok;
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── ReplyForm ─── */

function ReplyForm({ onSend, placeholder = "כתוב תגובה..." }: { onSend: (msg: string) => Promise<boolean>; placeholder?: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text.trim());
    setSending(false);
    if (ok) setText("");
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder={placeholder}
        disabled={sending}
        className="flex-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={sending || !text.trim()}
        className="inline-flex items-center gap-1 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark transition-colors hover:bg-brand-gold/80 disabled:opacity-50"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {sending ? "שולח..." : "שלח"}
      </button>
    </div>
  );
}

function ReplyButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium text-brand-gold hover:text-brand-dark transition-colors"
    >
      {open ? "סגור" : "הגב"}
    </button>
  );
}

/* ─── Facebook Messages (Conversations) ─── */

function FbMessagesView({
  data,
  expandedId,
  onToggle,
  canReply,
  onReply,
}: {
  data: any[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  canReply: boolean;
  onReply: (convId: string, msg: string) => Promise<boolean>;
}) {
  return (
    <div className="divide-y divide-brand-border">
      {data.map((conv: any) => {
        const isExpanded = expandedId === conv.id;
        const participants = conv.participants?.data?.map((p: any) => p.name).join(", ") ?? "—";
        return (
          <div key={conv.id}>
            <button
              onClick={() => onToggle(conv.id)}
              className="w-full text-right px-4 py-3 hover:bg-brand-bg transition-colors duration-200 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-brand-dark truncate">{participants}</p>
                <p className="text-sm text-brand-muted truncate">
                  {truncate(conv.snippet ?? conv.messages?.data?.[0]?.message, 80)}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-sm text-brand-muted">
                {conv.message_count != null && <span>{conv.message_count} הודעות</span>}
                {conv.updated_time && <span>{formatDate(conv.updated_time)}</span>}
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            {isExpanded && conv.messages?.data && (
              <div className="bg-brand-bg px-4 py-3 space-y-2 border-t border-brand-border">
                {conv.messages.data.map((msg: any, idx: number) => (
                  <div key={msg.id ?? idx} className={`rounded-lg p-3 text-sm ${msg._own ? "bg-brand-gold/10 border border-brand-gold/30" : "bg-brand-light"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-brand-dark">
                        {msg.from?.name ?? "—"}
                        {msg._own && <span className="ml-2 text-xs text-brand-gold">(אתם)</span>}
                      </span>
                      {msg.created_time && <span className="text-xs text-brand-muted">{formatDate(msg.created_time)}</span>}
                    </div>
                    <p className="text-brand-dark whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))}
                {canReply && (
                  <div className="pt-2 border-t border-brand-border">
                    <ReplyForm onSend={(msg) => onReply(conv.id, msg)} placeholder="הגב לשיחה זו..." />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Facebook Comments — list with reply ─── */

function FbCommentsList({
  data,
  canReply,
  onReply,
}: {
  data: any[];
  canReply: boolean;
  onReply: (commentId: string, msg: string) => Promise<boolean>;
}) {
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-brand-border">
      {data.map((comment: any) => {
        const isOpen = openReplyId === comment.id;
        return (
          <div key={comment.id} className="px-4 py-3 hover:bg-brand-bg/50 transition-colors">
            {/* פוסט/מודעה + תגית מקור */}
            <div className="mb-2 flex items-center gap-2 text-xs text-brand-muted">
              {comment.source === "ad" ? (
                <span className="shrink-0 rounded-full bg-brand-info/15 px-2 py-0.5 text-[10px] font-semibold text-brand-info">מודעה</span>
              ) : (
                <span className="shrink-0 rounded-full bg-brand-success/15 px-2 py-0.5 text-[10px] font-semibold text-brand-success">אורגני</span>
              )}
              {comment.source === "ad" && comment.ad_name ? (
                <span className="truncate font-medium">{truncate(comment.ad_name, 60)}</span>
              ) : comment.post_message ? (
                <span className="truncate">{truncate(comment.post_message, 60)}</span>
              ) : null}
              {comment.post_permalink && (
                <a href={comment.post_permalink} target="_blank" rel="noopener noreferrer" className="shrink-0 text-brand-gold hover:text-brand-dark">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* תגובה ראשית */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-brand-dark">{comment.from?.name ?? "—"}</span>
                  <span className="text-xs text-brand-muted">{formatDate(comment.created_time)}</span>
                  <span className="text-xs text-brand-muted">· {comment.like_count ?? 0} ❤</span>
                  {comment.permalink_url && (
                    <a href={comment.permalink_url} target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:text-brand-dark">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-brand-dark whitespace-pre-wrap">{comment.message ?? "—"}</p>
              </div>
              {canReply && <ReplyButton open={isOpen} onClick={() => setOpenReplyId(isOpen ? null : comment.id)} />}
            </div>

            {/* תגובות משנה */}
            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-3 mr-4 space-y-2 border-r-2 border-brand-border pr-3">
                {comment.replies.map((reply: any) => (
                  <div key={reply.id} className={`rounded-lg p-2 text-sm ${reply._own ? "bg-brand-gold/10 border border-brand-gold/30" : "bg-brand-bg"}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-brand-dark">
                        {reply.from?.name ?? "—"}
                        {reply._own && <span className="ml-1 text-brand-gold">(אתם)</span>}
                      </span>
                      <span className="text-xs text-brand-muted">{formatDate(reply.created_time)}</span>
                    </div>
                    <p className="text-xs text-brand-dark whitespace-pre-wrap">{reply.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* טופס תגובה */}
            {isOpen && canReply && (
              <div className="mt-3 mr-4 pr-3 border-r-2 border-brand-gold">
                <ReplyForm
                  onSend={async (msg) => {
                    const ok = await onReply(comment.id, msg);
                    if (ok) setOpenReplyId(null);
                    return ok;
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Instagram Comments — list with reply ─── */

function IgCommentsList({
  data,
  canReply,
  onReply,
}: {
  data: any[];
  canReply: boolean;
  onReply: (commentId: string, msg: string) => Promise<boolean>;
}) {
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-brand-border">
      {data.map((comment: any) => {
        const isOpen = openReplyId === comment.id;
        return (
          <div key={comment.id} className="px-4 py-3 hover:bg-brand-bg/50 transition-colors">
            {comment.media_caption && (
              <div className="mb-2 flex items-center gap-2 text-xs text-brand-muted">
                <span className="font-medium">פוסט:</span>
                <span className="truncate">{truncate(comment.media_caption, 80)}</span>
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-brand-dark">{comment.from?.username ?? "—"}</span>
                  <span className="text-xs text-brand-muted">{formatDate(comment.timestamp)}</span>
                  <span className="text-xs text-brand-muted">· {comment.like_count ?? 0} ❤</span>
                </div>
                <p className="text-sm text-brand-dark whitespace-pre-wrap">{comment.text ?? "—"}</p>
              </div>
              {canReply && <ReplyButton open={isOpen} onClick={() => setOpenReplyId(isOpen ? null : comment.id)} />}
            </div>

            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-3 mr-4 space-y-2 border-r-2 border-brand-border pr-3">
                {comment.replies.map((reply: any) => (
                  <div key={reply.id} className={`rounded-lg p-2 text-sm ${reply._own ? "bg-brand-gold/10 border border-brand-gold/30" : "bg-brand-bg"}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-brand-dark">
                        {reply.from?.username ?? "—"}
                        {reply._own && <span className="ml-1 text-brand-gold">(אתם)</span>}
                      </span>
                      <span className="text-xs text-brand-muted">{formatDate(reply.timestamp)}</span>
                    </div>
                    <p className="text-xs text-brand-dark whitespace-pre-wrap">{reply.text}</p>
                  </div>
                ))}
              </div>
            )}

            {isOpen && canReply && (
              <div className="mt-3 mr-4 pr-3 border-r-2 border-brand-gold">
                <ReplyForm
                  onSend={async (msg) => {
                    const ok = await onReply(comment.id, msg);
                    if (ok) setOpenReplyId(null);
                    return ok;
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
