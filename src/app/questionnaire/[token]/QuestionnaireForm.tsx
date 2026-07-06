"use client";

// טופס שאלון אונבורדינג ציבורי — הלקוח ממלא, שומר טיוטה וחוזר, ובסוף שולח.
import { useEffect, useState } from "react";

interface ProductRow { name: string; description: string; priceRange: string; promotions: string }
interface CompetitorRow { name: string; website: string }

interface Answers {
  businessDescription: string;
  serviceArea: string;
  serviceAreaDetails: string;
  products: ProductRow[];
  usp: string;
  whyChooseUs: string;
  socialProof: string;
  idealCustomer: string;
  objections: string;
  competitors: CompetitorRow[];
  toneOfVoice: string;
  addressStyle: string;
  forbiddenWords: string;
  assetBankUrl: string;
  existingAssets: string;
}

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-light px-3 py-2.5 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold";
const cardClass = "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm sm:p-6";

function Section({ num, title, subtitle, children }: { num: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold text-sm font-semibold text-brand-dark">{num}</span>
        <div>
          <h2 className="text-base font-semibold text-brand-dark">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-brand-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-brand-dark">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-brand-muted">{hint}</p>}
      {children}
    </div>
  );
}

export default function QuestionnaireForm({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "notFound" | "form" | "submitting" | "done">("loading");
  const [clientName, setClientName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [a, setA] = useState<Answers | null>(null);

  useEffect(() => {
    fetch(`/api/public/questionnaire/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setClientName(data.clientName);
        if (data.status === "completed") { setState("done"); return; }
        const ans: Answers = data.answers;
        if (!ans.products.length) ans.products = [{ name: "", description: "", priceRange: "", promotions: "" }];
        if (!ans.competitors.length) ans.competitors = [{ name: "", website: "" }];
        setA(ans);
        setState("form");
      })
      .catch(() => setState("notFound"));
  }, [token]);

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setA((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function saveDraft() {
    if (!a) return;
    try {
      const res = await fetch(`/api/public/questionnaire/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a),
      });
      if (res.ok) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2500); }
    } catch {}
  }

  async function submit() {
    if (!a) return;
    setState("submitting");
    try {
      const res = await fetch(`/api/public/questionnaire/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a),
      });
      if (!res.ok) throw new Error();
      setState("done");
      window.scrollTo({ top: 0 });
    } catch {
      setState("form");
      alert("השליחה נכשלה — נסו שוב בעוד רגע");
    }
  }

  if (state === "loading") return <p className="py-20 text-center text-sm text-brand-muted">טוען...</p>;

  if (state === "notFound") return (
    <div className={`${cardClass} text-center`}>
      <p className="text-lg font-semibold text-brand-dark">הקישור לא נמצא</p>
      <p className="mt-2 text-sm text-brand-muted">ייתכן שהקישור שגוי. פנו אלינו ונשלח לכם קישור חדש.</p>
    </div>
  );

  if (state === "done") return (
    <div className={`${cardClass} py-12 text-center`}>
      <p className="text-3xl">🎉</p>
      <h1 className="mt-3 text-xl font-semibold text-brand-dark">תודה רבה{clientName ? `, ${clientName}` : ""}!</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-brand-muted">
        התשובות נקלטו אצלנו. הצוות כבר מתחיל לעבוד על האסטרטגיה שלכם — נהיה בקשר בקרוב.
      </p>
    </div>
  );

  if (!a) return null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-brand-dark">נעים להכיר, {clientName} 👋</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-brand-muted">
          כמה שאלות קצרות שיעזרו לנו לבנות לכם אסטרטגיית פרסום מדויקת.
          ענו על מה שאתם יודעים — אפשר לדלג על שאלות, ולשמור טיוטה ולחזור בהמשך.
        </p>
      </div>

      <Section num={1} title="על העסק" subtitle="במילים שלכם — בלי ניסוחים שיווקיים">
        <Field label="ספרו על העסק בכמה משפטים" hint="מה אתם עושים, למי, וכמה זמן אתם פעילים">
          <textarea className={inputClass} rows={4} value={a.businessDescription} onChange={(e) => set("businessDescription", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="אזור פעילות">
            <select className={inputClass} value={a.serviceArea} onChange={(e) => set("serviceArea", e.target.value)}>
              <option value="">בחרו</option>
              <option value="local">מקומי / אזורי</option>
              <option value="national">כל הארץ</option>
              <option value="international">בינלאומי</option>
            </select>
          </Field>
          <Field label="ערים / אזורים עיקריים">
            <input className={inputClass} value={a.serviceAreaDetails} onChange={(e) => set("serviceAreaDetails", e.target.value)} placeholder="למשל: גוש דן והשרון" />
          </Field>
        </div>
      </Section>

      <Section num={2} title="מוצרים ושירותים" subtitle="המוצרים או השירותים המרכזיים שתרצו לקדם">
        {a.products.map((p, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-brand-border/60 bg-brand-bg p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-brand-muted">מוצר / שירות {i + 1}</span>
              {a.products.length > 1 && (
                <button type="button" onClick={() => set("products", a.products.filter((_, j) => j !== i))} className="text-xs text-brand-danger hover:underline">הסרה</button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={inputClass} placeholder="שם המוצר / השירות" value={p.name}
                onChange={(e) => set("products", a.products.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
              <input className={inputClass} placeholder="טווח מחירים (למשל: 500-1,500 ₪)" value={p.priceRange}
                onChange={(e) => set("products", a.products.map((r, j) => (j === i ? { ...r, priceRange: e.target.value } : r)))} />
            </div>
            <input className={inputClass} placeholder="תיאור קצר" value={p.description}
              onChange={(e) => set("products", a.products.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))} />
            <input className={inputClass} placeholder="מבצעים / הטבות שאתם נוהגים להציע (אופציונלי)" value={p.promotions}
              onChange={(e) => set("products", a.products.map((r, j) => (j === i ? { ...r, promotions: e.target.value } : r)))} />
          </div>
        ))}
        <button type="button" onClick={() => set("products", [...a.products, { name: "", description: "", priceRange: "", promotions: "" }])}
          className="text-sm font-medium text-brand-dark underline decoration-brand-gold decoration-2 underline-offset-4 hover:opacity-70">
          + הוספת מוצר / שירות
        </button>
      </Section>

      <Section num={3} title="מה מייחד אתכם">
        <Field label="מה מבדל אתכם מהמתחרים? (משפט אחד)">
          <input className={inputClass} value={a.usp} onChange={(e) => set("usp", e.target.value)} />
        </Field>
        <Field label="למה לקוחות בוחרים דווקא בכם?">
          <textarea className={inputClass} rows={3} value={a.whyChooseUs} onChange={(e) => set("whyChooseUs", e.target.value)} />
        </Field>
        <Field label="הוכחות חברתיות" hint="ביקורות, המלצות, מספרים (כמה לקוחות שירתתם, שנות ותק...)">
          <textarea className={inputClass} rows={3} value={a.socialProof} onChange={(e) => set("socialProof", e.target.value)} />
        </Field>
        <Field label="התנגדויות נפוצות" hint="מה מונע מלקוחות לסגור אתכם, ומה אתם עונים ('יקר לי' → ...)">
          <textarea className={inputClass} rows={3} value={a.objections} onChange={(e) => set("objections", e.target.value)} />
        </Field>
      </Section>

      <Section num={4} title="הלקוחות שלכם">
        <Field label="מי הלקוח האידיאלי שלכם?" hint="גיל, מגדר, מקום מגורים, מה מטריד אותו, מה הוא מחפש">
          <textarea className={inputClass} rows={4} value={a.idealCustomer} onChange={(e) => set("idealCustomer", e.target.value)} />
        </Field>
      </Section>

      <Section num={5} title="מתחרים" subtitle="מי המתחרים שאתם מכירים? מספיק שם — אם יש אתר, עוד יותר טוב">
        {a.competitors.map((c, i) => (
          <div key={i} className="flex items-center gap-3">
            <input className={inputClass} placeholder="שם המתחרה" value={c.name}
              onChange={(e) => set("competitors", a.competitors.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
            <input className={inputClass} placeholder="אתר (אופציונלי)" value={c.website} dir="ltr"
              onChange={(e) => set("competitors", a.competitors.map((r, j) => (j === i ? { ...r, website: e.target.value } : r)))} />
            {a.competitors.length > 1 && (
              <button type="button" onClick={() => set("competitors", a.competitors.filter((_, j) => j !== i))} className="shrink-0 text-xs text-brand-danger hover:underline">הסרה</button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => set("competitors", [...a.competitors, { name: "", website: "" }])}
          className="text-sm font-medium text-brand-dark underline decoration-brand-gold decoration-2 underline-offset-4 hover:opacity-70">
          + הוספת מתחרה
        </button>
      </Section>

      <Section num={6} title="שפה וסגנון">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="איזה טון דיבור מתאים למותג שלכם?">
            <select className={inputClass} value={a.toneOfVoice} onChange={(e) => set("toneOfVoice", e.target.value)}>
              <option value="">בחרו</option>
              {["רשמי", "ידידותי", "צעיר", "מקצועי", "שנון", "יוקרתי", "פרובוקטיבי"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="איך פונים לקהל?">
            <select className={inputClass} value={a.addressStyle} onChange={(e) => set("addressStyle", e.target.value)}>
              <option value="">בחרו</option>
              {["אתה", "את", "אתם", "גוף שלישי"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>
        <Field label="מילים או נושאים שאסור להשתמש בהם" hint="רגישויות, מגבלות רגולטוריות, דברים שלא מתאימים למותג">
          <textarea className={inputClass} rows={2} value={a.forbiddenWords} onChange={(e) => set("forbiddenWords", e.target.value)} />
        </Field>
      </Section>

      <Section num={7} title="חומרים וגישות">
        <Field label="קישור לחומרים גרפיים" hint="תיקיית דרייב/דרופבוקס עם לוגו, תמונות, סרטונים">
          <input className={inputClass} dir="ltr" value={a.assetBankUrl} onChange={(e) => set("assetBankUrl", e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="אילו חשבונות פרסום וכלים כבר קיימים?" hint="חשבון מודעות בפייסבוק/גוגל, פיקסל, Google Analytics, מערכת CRM — ומי מנהל אותם היום">
          <textarea className={inputClass} rows={3} value={a.existingAssets} onChange={(e) => set("existingAssets", e.target.value)} />
        </Field>
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-brand-border bg-brand-light/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={saveDraft}
            className="rounded-lg border border-brand-border bg-brand-light px-4 py-2.5 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-bg">
            {savedFlash ? "✓ נשמר" : "שמירת טיוטה"}
          </button>
          <button type="button" onClick={submit} disabled={state === "submitting"}
            className="rounded-lg bg-brand-gold px-8 py-2.5 text-sm font-semibold text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 disabled:cursor-wait disabled:opacity-60">
            {state === "submitting" ? "שולח..." : "שליחת השאלון"}
          </button>
        </div>
      </div>
    </div>
  );
}
