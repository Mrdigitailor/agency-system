"use client";

// הידע של הסוכן: מה שבעל העסק רוצה שהסוכן ידע לענות. מחירים, שעות, שאלות נפוצות.
// תשובות לאסקלציות נשמרות כאן אוטומטית.
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { type KnowledgeItem, cardCls, inputCls, goldBtn, fmtDate, portalApi, PageTitle } from "./shared";

export default function KnowledgeTab({ token }: { token: string }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // מזהה פריט, או "new"
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await portalApi<{ items?: KnowledgeItem[] }>(token, { query: "view=knowledge" });
    if (res.ok) setItems(res.data.items ?? []);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const startEdit = (item?: KnowledgeItem) => {
    setEditing(item?.id ?? "new"); setTitle(item?.title ?? ""); setContent(item?.content ?? ""); setError("");
  };
  const cancel = () => { setEditing(null); setError(""); };

  const save = async () => {
    if (!title.trim() || !content.trim()) { setError("צריך למלא גם נושא וגם תוכן"); return; }
    setSaving(true); setError("");
    if (editing === "new") {
      const res = await portalApi<{ item?: KnowledgeItem; error?: string }>(token, { method: "POST", body: { kind: "knowledge", title, content } });
      if (res.ok && res.data.item) { setItems((xs) => [res.data.item!, ...xs]); setEditing(null); }
      else setError(res.data.error ?? "השמירה נכשלה");
    } else if (editing) {
      const res = await portalApi<{ error?: string }>(token, { method: "PATCH", body: { kind: "knowledge", id: editing, title, content } });
      if (res.ok) { setItems((xs) => xs.map((x) => (x.id === editing ? { ...x, title: title.trim(), content: content.trim() } : x))); setEditing(null); }
      else setError(res.data.error ?? "השמירה נכשלה");
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await portalApi(token, { method: "PATCH", body: { kind: "knowledge", id, remove: true } });
  };

  const form = (
    <div className={`${cardCls} space-y-3 p-4`}>
      <div>
        <label className="mb-1 block text-xs text-white/50">נושא או שאלה</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: מחירון, שעות פעילות, האם יש אחריות" className={`${inputCls} w-full`} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-white/50">מה הסוכן צריך לדעת</label>
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="כתוב את התשובה כמו שהיית רוצה שהסוכן יענה ללקוח" className={`${inputCls} w-full resize-none`} />
      </div>
      {error && <div className="text-sm text-red-300">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={cancel} className="rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white">ביטול</button>
        <button onClick={save} disabled={saving} className={goldBtn}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירה"}</button>
      </div>
    </div>
  );

  return (
    <>
      <PageTitle title="הידע של הסוכן" sub="מה שהסוכן יודע על העסק שלך: מחירים, שעות, שאלות נפוצות. כל שינוי נכנס לתוקף בשיחה הבאה">
        {editing !== "new" && <button onClick={() => startEdit()} className={goldBtn}><Plus className="h-4 w-4" /> פריט חדש</button>}
      </PageTitle>

      {editing === "new" && form}
      {loading && <div className="py-16 text-center text-white/40"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>}

      {!loading && items.length === 0 && editing !== "new" && (
        <div className={`${cardCls} px-6 py-14 text-center`}>
          <BookOpen className="mx-auto h-10 w-10 text-brand-gold/40" />
          <div className="mt-4 text-lg font-medium text-white/80">עוד לא הוזן ידע</div>
          <div className="mx-auto mt-2 max-w-md text-sm text-white/45">הוסף כאן את מה שלקוחות שואלים הכי הרבה, והסוכן יענה על זה בעצמו במקום להעביר אליך.</div>
        </div>
      )}

      {!loading && items.map((item) => editing === item.id ? <div key={item.id}>{form}</div> : (
        <div key={item.id} className={`${cardCls} group p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-white">{item.title}</div>
              <div className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-white/70">{item.content}</div>
              <div className="mt-2 text-xs text-white/30">
                {item.source === "escalation" ? "נוסף מתשובה לאסקלציה" : "הוזן ידנית"} · עודכן {fmtDate(item.updatedAt)}
              </div>
            </div>
            <div className="flex gap-1 opacity-60 transition-opacity duration-200 group-hover:opacity-100">
              <button onClick={() => startEdit(item)} title="עריכה" aria-label="עריכת הפריט" className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(item.id)} title="הסרה" aria-label="הסרת הפריט" className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
