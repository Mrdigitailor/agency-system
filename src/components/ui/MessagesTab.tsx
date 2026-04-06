"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<TabType>("fb_messages");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionError(null);
    setExpandedConversation(null);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/messages?type=${activeTab}`
      );
      const json: ApiResponse = await res.json();
      if (json.permissionError) {
        setPermissionError(json.permissionError);
        setData([]);
      } else if (json.error) {
        setError(json.error);
        setData([]);
      } else {
        setData(json.data ?? []);
      }
    } catch {
      setError("שגיאה בטעינת הנתונים");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, activeTab]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const toggleConversation = (id: string) => {
    setExpandedConversation((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Tabs + Refresh */}
      <div className="flex items-center gap-2 flex-wrap">
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
          onClick={fetchMessages}
          disabled={loading}
          className="p-2 rounded-full bg-brand-bg text-brand-muted hover:text-brand-dark transition-colors duration-200 disabled:opacity-50"
          title="רענון"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Permission Error Banner */}
      {permissionError && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-yellow-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">נדרשת הרשאה נוספת: {permissionError}</p>
            <p className="text-sm mt-1">
              יש לחבר מחדש את החשבון עם ההרשאות הנדרשות כדי לצפות בנתונים אלו.
            </p>
          </div>
        </div>
      )}

      {/* API Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-center text-brand-muted py-8">טוען הודעות...</p>
      )}

      {/* Empty State */}
      {!loading && !error && !permissionError && data.length === 0 && (
        <div className="text-center text-brand-muted py-12 space-y-2">
          <MessageSquare className="w-10 h-10 mx-auto opacity-40" />
          <p>אין הודעות</p>
        </div>
      )}

      {/* Content */}
      {!loading && data.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm overflow-hidden">
          {activeTab === "fb_messages" && (
            <FbMessagesView
              data={data}
              expandedId={expandedConversation}
              onToggle={toggleConversation}
            />
          )}
          {activeTab === "fb_comments" && <FbCommentsTable data={data} />}
          {activeTab === "ig_comments" && <IgCommentsTable data={data} />}
        </div>
      )}
    </div>
  );
}

/* ─── Facebook Messages (Conversations) ─── */

function FbMessagesView({
  data,
  expandedId,
  onToggle,
}: {
  data: any[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="divide-y divide-brand-border">
      {data.map((conv: any) => {
        const isExpanded = expandedId === conv.id;
        const participants =
          conv.participants?.data
            ?.map((p: any) => p.name)
            .join(", ") ?? "—";
        return (
          <div key={conv.id}>
            <button
              onClick={() => onToggle(conv.id)}
              className="w-full text-right px-4 py-3 hover:bg-brand-bg transition-colors duration-200 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-brand-dark truncate">
                  {participants}
                </p>
                <p className="text-sm text-brand-muted truncate">
                  {truncate(conv.snippet ?? conv.messages?.data?.[0]?.message, 80)}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-sm text-brand-muted">
                {conv.message_count != null && (
                  <span>{conv.message_count} הודעות</span>
                )}
                {conv.updated_time && (
                  <span>{formatDate(conv.updated_time)}</span>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>
            {isExpanded && conv.messages?.data && (
              <div className="bg-brand-bg px-4 py-3 space-y-2 border-t border-brand-border">
                {conv.messages.data.map((msg: any, idx: number) => (
                  <div
                    key={msg.id ?? idx}
                    className="rounded-lg bg-brand-light p-3 text-sm"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-brand-dark">
                        {msg.from?.name ?? "—"}
                      </span>
                      {msg.created_time && (
                        <span className="text-xs text-brand-muted">
                          {formatDate(msg.created_time)}
                        </span>
                      )}
                    </div>
                    <p className="text-brand-dark">{msg.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Facebook Comments Table ─── */

function FbCommentsTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-brand-bg text-brand-muted border-b border-brand-border">
            <th className="px-4 py-3 text-right font-medium">פוסט</th>
            <th className="px-4 py-3 text-right font-medium">תגובה</th>
            <th className="px-4 py-3 text-right font-medium">מגיב</th>
            <th className="px-4 py-3 text-right font-medium">תאריך</th>
            <th className="px-4 py-3 text-right font-medium">לייקים</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {data.map((comment: any, idx: number) => (
            <tr
              key={comment.id ?? idx}
              className="hover:bg-brand-bg transition-colors duration-200"
            >
              <td className="px-4 py-3 text-brand-dark max-w-[200px]">
                {truncate(comment.post_message)}
              </td>
              <td className="px-4 py-3 text-brand-dark">
                {comment.message ?? "—"}
              </td>
              <td className="px-4 py-3 text-brand-muted">
                {comment.from?.name ?? "—"}
              </td>
              <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                {comment.created_time ? formatDate(comment.created_time) : "—"}
              </td>
              <td className="px-4 py-3 text-brand-muted">
                {comment.like_count ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Instagram Comments Table ─── */

function IgCommentsTable({ data }: { data: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-brand-bg text-brand-muted border-b border-brand-border">
            <th className="px-4 py-3 text-right font-medium">פוסט</th>
            <th className="px-4 py-3 text-right font-medium">תגובה</th>
            <th className="px-4 py-3 text-right font-medium">מגיב</th>
            <th className="px-4 py-3 text-right font-medium">תאריך</th>
            <th className="px-4 py-3 text-right font-medium">לייקים</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {data.map((comment: any, idx: number) => (
            <tr
              key={comment.id ?? idx}
              className="hover:bg-brand-bg transition-colors duration-200"
            >
              <td className="px-4 py-3 text-brand-dark max-w-[200px]">
                {truncate(comment.media_caption)}
              </td>
              <td className="px-4 py-3 text-brand-dark">
                {comment.text ?? "—"}
              </td>
              <td className="px-4 py-3 text-brand-muted">
                {comment.from?.username ?? "—"}
              </td>
              <td className="px-4 py-3 text-brand-muted whitespace-nowrap">
                {comment.timestamp ? formatDate(comment.timestamp) : "—"}
              </td>
              <td className="px-4 py-3 text-brand-muted">
                {comment.like_count ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
