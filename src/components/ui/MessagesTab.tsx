"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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

type Platform = "facebook" | "instagram";
type SubTab = "messages" | "comments";
type ApiType = "fb_messages" | "fb_comments" | "ig_messages" | "ig_comments";

interface ApiResponse {
  data: any[];
  error?: string;
  permissionError?: string;
  lastSyncAt?: string | null;
  reviewUrl?: string;
}

const REPLY_ALLOWED_ROLES = new Set(["admin", "manager", "campaignManager"]);

function getApiType(platform: Platform, sub: SubTab): ApiType {
  if (platform === "facebook" && sub === "messages") return "fb_messages";
  if (platform === "facebook" && sub === "comments") return "fb_comments";
  if (platform === "instagram" && sub === "messages") return "ig_messages";
  return "ig_comments";
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
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

  const [platform, setPlatform] = useState<Platform>("facebook");
  const [subTab, setSubTab] = useState<SubTab>("messages");
  const apiType = getApiType(platform, subTab);

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | "organic" | "ad">("all");
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionError(null);
    setReviewUrl(null);
    setExpandedConversation(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/messages?type=${apiType}`);
      const json: ApiResponse = await res.json();
      if (json.permissionError) { setPermissionError(json.permissionError); setReviewUrl(json.reviewUrl ?? null); setData([]); }
      else if (json.error) { setError(json.error); setData([]); }
      else { setData(json.data ?? []); setLastSyncAt(json.lastSyncAt ?? null); }
    } catch { setError("שגיאה בטעינת הנתונים"); setData([]); }
    finally { setLoading(false); }
  }, [clientId, apiType]);

  const refreshFromApi = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setPermissionError(null);
    setReviewUrl(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/messages?type=${apiType}`, { method: "POST" });
      const json: ApiResponse = await res.json();
      if (json.permissionError) { setPermissionError(json.permissionError); setReviewUrl(json.reviewUrl ?? null); }
      else if (json.error) setError(json.error);
      else { setData(json.data ?? []); setLastSyncAt(json.lastSyncAt ?? new Date().toISOString()); }
    } catch { setError("שגיאה בסנכרון"); }
    finally { setSyncing(false); }
  }, [clientId, apiType]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  async function sendReply(type: ApiType, targetId: string, message: string): Promise<boolean> {
    // Map API type to reply type
    const replyType = type === "fb_messages" ? "fb_message"
      : type === "fb_comments" ? "fb_comment"
      : type === "ig_messages" ? "ig_message"
      : "ig_comment";
    try {
      const res = await fetch(`/api/clients/${clientId}/messages/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: replyType, targetId, message }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { alert(`שגיאה: ${json.error ?? "נכשלה השליחה"}`); return false; }
      return true;
    } catch { alert("שגיאה ברשת"); return false; }
  }

  function appendOptimisticReply(type: ApiType, targetId: string, message: string) {
    const now = new Date().toISOString();
    if (type === "fb_comments") {
      setData((prev) => prev.map((c: any) =>
        c.id === targetId
          ? { ...c, replies: [...(c.replies ?? []), { id: `opt_${Date.now()}`, message, from: { name: "אתם" }, created_time: now, _own: true }] }
          : c
      ));
    } else if (type === "fb_messages" || type === "ig_messages") {
      setData((prev) => prev.map((conv: any) =>
        conv.id === targetId
          ? { ...conv, messages: { data: [{ id: `opt_${Date.now()}`, message, from: { name: "אתם", username: "אתם" }, created_time: now, _own: true }, ...(conv.messages?.data ?? [])] } }
          : conv
      ));
    } else if (type === "ig_comments") {
      setData((prev) => prev.map((c: any) =>
        c.id === targetId
          ? { ...c, replies: [...(c.replies ?? []), { id: `opt_${Date.now()}`, text: message, from: { username: "אתם" }, timestamp: now, _own: true }] }
          : c
      ));
    }
  }

  const filteredData = useMemo(() => {
    if (apiType !== "fb_comments" || sourceFilter === "all") return data;
    return data.filter((c: any) => c.source === sourceFilter);
  }, [data, sourceFilter, apiType]);

  const isMessages = subTab === "messages";

  return (
    <div className="space-y-4" dir="rtl">
      {/* Platform tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-brand-border overflow-hidden">
          {(["facebook", "instagram"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPlatform(p); setSubTab("messages"); setSourceFilter("all"); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${platform === p ? "bg-brand-gold text-brand-dark" : "bg-brand-light text-brand-muted hover:bg-brand-bg"}`}
            >
              {p === "facebook" ? "פייסבוק" : "אינסטגרם"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-brand-border overflow-hidden">
          {(["messages", "comments"] as SubTab[]).map((s) => (
            <button
              key={s}
              onClick={() => { setSubTab(s); setSourceFilter("all"); }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${subTab === s ? "bg-brand-dark text-brand-light" : "bg-brand-light text-brand-muted hover:bg-brand-bg"}`}
            >
              {s === "messages" ? "הודעות" : "תגובות"}
            </button>
          ))}
        </div>

        {apiType === "fb_comments" && (
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as "all" | "organic" | "ad")}
            className="rounded-lg bg-brand-bg px-3 py-1.5 text-xs text-brand-dark border border-brand-border focus:border-brand-gold focus:outline-none"
          >
            <option value="all">הכל</option>
            <option value="organic">אורגני</option>
            <option value="ad">מודעות</option>
          </select>
        )}

        <button
          onClick={refreshFromApi}
          disabled={syncing || loading}
          className="p-2 rounded-full bg-brand-bg text-brand-muted hover:text-brand-dark transition-colors disabled:opacity-50"
          title="סנכרן מ-Meta"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        </button>
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
            <p className="font-medium">{permissionError}</p>
            {reviewUrl && (
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80"
              >
                בקש הרשאה ב-Meta →
              </a>
            )}
            {!reviewUrl && (
              <p className="text-sm mt-1">התנתק וחבר מחדש את Meta כדי לקבל את ההרשאה.</p>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {loading && <p className="text-center text-brand-muted py-8">טוען...</p>}
      {!loading && !error && !permissionError && filteredData.length === 0 && (
        <div className="text-center text-brand-muted py-12 space-y-2">
          <MessageSquare className="w-10 h-10 mx-auto opacity-40" />
          <p>אין {isMessages ? "הודעות" : "תגובות"}</p>
        </div>
      )}

      {!loading && filteredData.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm overflow-hidden">
          {isMessages ? (
            <ConversationsView
              data={filteredData}
              expandedId={expandedConversation}
              onToggle={(id) => setExpandedConversation((p) => p === id ? null : id)}
              canReply={canReply}
              onReply={async (convId, msg) => {
                const ok = await sendReply(apiType, convId, msg);
                if (ok) appendOptimisticReply(apiType, convId, msg);
                return ok;
              }}
              platform={platform}
            />
          ) : platform === "facebook" ? (
            <FbCommentsList
              data={filteredData}
              canReply={canReply}
              onReply={async (cid, msg) => {
                const ok = await sendReply("fb_comments", cid, msg);
                if (ok) appendOptimisticReply("fb_comments", cid, msg);
                return ok;
              }}
            />
          ) : (
            <IgCommentsList
              data={filteredData}
              canReply={canReply}
              onReply={async (cid, msg) => {
                const ok = await sendReply("ig_comments", cid, msg);
                if (ok) appendOptimisticReply("ig_comments", cid, msg);
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
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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

/* ─── Conversations (FB + IG — unified view) ─── */

function ConversationsView({
  data, expandedId, onToggle, canReply, onReply, platform,
}: {
  data: any[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  canReply: boolean;
  onReply: (convId: string, msg: string) => Promise<boolean>;
  platform: Platform;
}) {
  return (
    <div className="divide-y divide-brand-border">
      {data.map((conv: any) => {
        const isExpanded = expandedId === conv.id;
        const participants = conv.participants?.data?.map((p: any) => p.username ?? p.name).join(", ") ?? "—";
        const snippet = conv.snippet ?? conv.messages?.data?.[0]?.message ?? "";
        return (
          <div key={conv.id}>
            <button
              onClick={() => onToggle(conv.id)}
              className="w-full text-right px-4 py-3 hover:bg-brand-bg transition-colors flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-brand-dark truncate">{participants}</p>
                <p className="text-sm text-brand-muted truncate">{truncate(snippet, 80)}</p>
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
                        {msg.from?.username ?? msg.from?.name ?? "—"}
                        {msg._own && <span className="mr-2 text-xs text-brand-gold">(אתם)</span>}
                      </span>
                      {(msg.created_time ?? msg.timestamp) && (
                        <span className="text-xs text-brand-muted">{formatDate(msg.created_time ?? msg.timestamp)}</span>
                      )}
                    </div>
                    <p className="text-brand-dark whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))}
                {canReply && (
                  <div className="pt-2 border-t border-brand-border">
                    <ReplyForm
                      onSend={(msg) => onReply(conv.id, msg)}
                      placeholder={platform === "facebook" ? "הגב לשיחה זו..." : "הגב בדם אינסטגרם..."}
                    />
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

/* ─── FB Comments ─── */

function FbCommentsList({
  data, canReply, onReply,
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
            {/* מקור + פוסט/מודעה */}
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

            {/* תגובה ראשית — לחיצה פותחת reply */}
            <div
              className={`flex items-start justify-between gap-3 ${canReply ? "cursor-pointer" : ""}`}
              onClick={canReply ? () => setOpenReplyId(isOpen ? null : comment.id) : undefined}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-brand-dark">{comment.from?.name ?? "—"}</span>
                  <span className="text-xs text-brand-muted">{formatDate(comment.created_time)}</span>
                  <span className="text-xs text-brand-muted">· {comment.like_count ?? 0} ❤</span>
                  {comment.permalink_url && (
                    <a href={comment.permalink_url} target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:text-brand-dark" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-brand-dark whitespace-pre-wrap">{comment.message ?? "—"}</p>
              </div>
            </div>

            {/* תגובות משנה */}
            {comment.replies?.length > 0 && (
              <div className="mt-3 mr-4 space-y-2 border-r-2 border-brand-border pr-3">
                {comment.replies.map((reply: any) => (
                  <div key={reply.id} className={`rounded-lg p-2 text-sm ${reply._own ? "bg-brand-gold/10 border border-brand-gold/30" : "bg-brand-bg"}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-brand-dark">
                        {reply.from?.name ?? "—"}
                        {reply._own && <span className="mr-1 text-brand-gold">(אתם)</span>}
                      </span>
                      <span className="text-xs text-brand-muted">{formatDate(reply.created_time)}</span>
                    </div>
                    <p className="text-xs text-brand-dark whitespace-pre-wrap">{reply.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* inline reply */}
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

/* ─── IG Comments (same UX as FB — click to reply) ─── */

function IgCommentsList({
  data, canReply, onReply,
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

            {/* תגובה — לחיצה פותחת reply */}
            <div
              className={`flex items-start justify-between gap-3 ${canReply ? "cursor-pointer" : ""}`}
              onClick={canReply ? () => setOpenReplyId(isOpen ? null : comment.id) : undefined}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-brand-dark">{comment.from?.username ?? "—"}</span>
                  <span className="text-xs text-brand-muted">{formatDate(comment.timestamp)}</span>
                  <span className="text-xs text-brand-muted">· {comment.like_count ?? 0} ❤</span>
                </div>
                <p className="text-sm text-brand-dark whitespace-pre-wrap">{comment.text ?? "—"}</p>
              </div>
            </div>

            {comment.replies?.length > 0 && (
              <div className="mt-3 mr-4 space-y-2 border-r-2 border-brand-border pr-3">
                {comment.replies.map((reply: any) => (
                  <div key={reply.id} className={`rounded-lg p-2 text-sm ${reply._own ? "bg-brand-gold/10 border border-brand-gold/30" : "bg-brand-bg"}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-brand-dark">
                        {reply.from?.username ?? "—"}
                        {reply._own && <span className="mr-1 text-brand-gold">(אתם)</span>}
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
