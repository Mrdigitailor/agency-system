"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Building2, ShoppingBag, Award, Users, Globe, Target, Palette,
  DollarSign, FileText, MessageSquare, ChevronDown, Plus, Trash2, Save,
} from "lucide-react";
import type { ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────
interface Props {
  clientId: string;
  userRole: string;
  clientData: { website: string; monthlyBudget: number; currency: string; notes: string };
}

interface Product {
  name: string; description: string; priceRange: string; pricingModel: string; seasonality: string; promotions: string;
}
interface Competitor {
  name: string; website: string; facebook: string; instagram: string; adLibrary: string; strengths: string; weaknesses: string; notes: string;
}
interface AudienceData {
  demographics: string; interests: string; feelings: string; keywords: string; contentTypes: string[]; notes: string;
}
interface DocItem {
  name: string; type: string; date: string; fileUrl: string;
}
interface NoteItem {
  content: string; date: string; author: string;
}

interface Profile {
  businessSector: string; businessDescription: string; serviceArea: string; serviceAreaDetails: string; physicalAddress: string;
  products: Product[]; usp: string; competitiveAdvantage: string; whyChooseUs: string; socialProof: string; entryBarriers: string; objections: string;
  awarenessLevels: string[]; audiences: Record<string, AudienceData>;
  marketingLanguages: string[]; toneOfVoice: string; forbiddenWords: string; addressStyle: string;
  competitors: Competitor[]; brandColors: string[]; logoUrl: string; adDesignStyle: string; assetBankUrl: string;
  leadSource: string; lifetimeValue: number; paymentHistory: any[]; documents: DocItem[]; internalNotes: NoteItem[];
  leadFunnel: string; crmAccess: string;
}

const emptyProfile: Profile = {
  businessSector: "", businessDescription: "", serviceArea: "", serviceAreaDetails: "", physicalAddress: "",
  products: [], usp: "", competitiveAdvantage: "", whyChooseUs: "", socialProof: "", entryBarriers: "", objections: "",
  awarenessLevels: [], audiences: {},
  marketingLanguages: [], toneOfVoice: "", forbiddenWords: "", addressStyle: "",
  competitors: [], brandColors: [], logoUrl: "", adDesignStyle: "", assetBankUrl: "",
  leadSource: "", lifetimeValue: 0, paymentHistory: [], documents: [], internalNotes: [],
  leadFunnel: "landing_page", crmAccess: "none",
};

const emptyProduct = (): Product => ({ name: "", description: "", priceRange: "", pricingModel: "", seasonality: "", promotions: "" });
const emptyCompetitor = (): Competitor => ({ name: "", website: "", facebook: "", instagram: "", adLibrary: "", strengths: "", weaknesses: "", notes: "" });
const emptyDoc = (): DocItem => ({ name: "", type: "", date: new Date().toISOString().slice(0, 10), fileUrl: "" });
const emptyAudience = (): AudienceData => ({ demographics: "", interests: "", feelings: "", keywords: "", contentTypes: [], notes: "" });

// ─── Styles ──────────────────────────────────────────────────────────
const inputClass = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const btnPrimary = "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";
const btnDanger = "rounded-lg border border-red-300 px-2 py-1.5 text-red-500 hover:bg-red-50 transition-colors duration-200";

// ─── Helpers ─────────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = false }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-right">
        <div className="flex items-center gap-2">{icon}<h3 className="text-sm font-semibold text-brand-dark">{title}</h3></div>
        <ChevronDown className={`h-4 w-4 text-brand-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-brand-border px-5 py-4">{children}</div>}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-brand-muted">{children}</label>;
}

function SaveBtn({ onClick, saved }: { onClick: () => void; saved: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button onClick={onClick} className={btnPrimary + " flex items-center gap-1.5"}>
        <Save className="h-3.5 w-3.5" /> שמור
      </button>
      {saved && <span className="text-xs text-green-600 font-medium">נשמר!</span>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function ClientIdentityTab({ clientId, userRole, clientData }: Props) {
  const { data: session } = useSession();
  const [p, setP] = useState<Profile>(emptyProfile);
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [noteInput, setNoteInput] = useState("");
  const [website, setWebsite] = useState<string>(clientData.website || "");

  // סנכרן את שדה האתר כשה-prop משתנה (טעינת הלקוח)
  useEffect(() => {
    setWebsite(clientData.website || "");
  }, [clientData.website]);

  // load profile
  useEffect(() => {
    fetch(`/api/clients/${clientId}/profile`).then(r => r.json()).then(d => setP({ ...emptyProfile, ...d }));
  }, [clientId]);

  const patchSection = useCallback(async (key: string, data: Partial<Profile>) => {
    await fetch(`/api/clients/${clientId}/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setSavedMap(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setSavedMap(prev => ({ ...prev, [key]: false })), 2000);
  }, [clientId]);

  // שמירת שדות שיושבים על מודל הלקוח (לא על ה-profile) — למשל website
  const patchClient = useCallback(async (data: Record<string, unknown>) => {
    await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  }, [clientId]);

  const update = <K extends keyof Profile>(k: K, v: Profile[K]) => setP(prev => ({ ...prev, [k]: v }));

  // product helpers
  const updateProduct = (i: number, field: keyof Product, val: string) => {
    const next = [...p.products]; next[i] = { ...next[i], [field]: val }; update("products", next);
  };
  const addProduct = () => update("products", [...p.products, emptyProduct()]);
  const removeProduct = (i: number) => update("products", p.products.filter((_, idx) => idx !== i));

  // competitor helpers
  const updateCompetitor = (i: number, field: keyof Competitor, val: string) => {
    const next = [...p.competitors]; next[i] = { ...next[i], [field]: val }; update("competitors", next);
  };
  const addCompetitor = () => { if (p.competitors.length < 5) update("competitors", [...p.competitors, emptyCompetitor()]); };
  const removeCompetitor = (i: number) => update("competitors", p.competitors.filter((_, idx) => idx !== i));

  // audience helpers
  const toggleAwareness = (level: string) => {
    const has = p.awarenessLevels.includes(level);
    const next = has ? p.awarenessLevels.filter(l => l !== level) : [...p.awarenessLevels, level];
    const audiences = { ...p.audiences };
    if (!has) audiences[level] = audiences[level] || emptyAudience();
    else delete audiences[level];
    setP(prev => ({ ...prev, awarenessLevels: next, audiences }));
  };
  const updateAudience = (level: string, field: keyof AudienceData, val: any) => {
    const audiences = { ...p.audiences, [level]: { ...p.audiences[level], [field]: val } };
    update("audiences", audiences);
  };

  // color helpers
  const updateColor = (i: number, val: string) => { const c = [...p.brandColors]; c[i] = val; update("brandColors", c); };
  const addColor = () => { if (p.brandColors.length < 5) update("brandColors", [...p.brandColors, "#eed89b"]); };
  const removeColor = (i: number) => update("brandColors", p.brandColors.filter((_, idx) => idx !== i));

  // document helpers
  const updateDoc = (i: number, field: keyof DocItem, val: string) => {
    const next = [...p.documents]; next[i] = { ...next[i], [field]: val }; update("documents", next);
  };
  const addDoc = () => update("documents", [...p.documents, emptyDoc()]);
  const removeDoc = (i: number) => update("documents", p.documents.filter((_, idx) => idx !== i));

  // note helpers
  const addNote = () => {
    if (!noteInput.trim()) return;
    const note: NoteItem = { content: noteInput.trim(), date: new Date().toISOString(), author: session?.user?.name || "אנונימי" };
    update("internalNotes", [note, ...p.internalNotes]);
    setNoteInput("");
  };

  const awarenessOptions = [
    { value: "unaware", label: "לא מודע (Unaware)" },
    { value: "problem_aware", label: "מודע לבעיה" },
    { value: "solution_aware", label: "מודע לפתרון" },
    { value: "product_aware", label: "מודע למוצר" },
    { value: "most_aware", label: "מוכן לקנייה" },
  ];

  const contentTypeOptions = ["סטוריטלינג", "חינוכי", "טיפים", "השוואות", "עדויות", "מבצעים", "ויראלי", "case studies", "מדריכים"];

  return (
    <div dir="rtl" className="space-y-4">

      {/* 1. פרטי העסק */}
      <Section title="פרטי העסק" icon={<Building2 className="h-4 w-4 text-brand-gold" />} defaultOpen>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>תחום עסקי</Label>
            <select value={p.businessSector} onChange={e => update("businessSector", e.target.value)} className={inputClass}>
              <option value="">בחר תחום</option>
              {["מסעדנות", "נדל\"ן", "ecom", "בריאות", "חינוך", "טכנולוגיה", "פיננסים", "אופנה", "שירותים מקצועיים", "תיירות", "כושר", "יופי", "רכב", "משפטי", "אחר"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <Label>אזור שירות</Label>
            <select value={p.serviceArea} onChange={e => update("serviceArea", e.target.value)} className={inputClass}>
              <option value="">בחר</option>
              {["מקומי", "ארצי", "בינלאומי"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {p.serviceArea === "מקומי" && (
            <div>
              <Label>פירוט אזור</Label>
              <input value={p.serviceAreaDetails} onChange={e => update("serviceAreaDetails", e.target.value)} className={inputClass} placeholder="עיר / אזור" />
            </div>
          )}
          <div>
            <Label>אתר אינטרנט</Label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className={inputClass}
              placeholder="https://..."
              dir="ltr"
            />
          </div>
          <div>
            <Label>כתובת פיזית</Label>
            <input value={p.physicalAddress} onChange={e => update("physicalAddress", e.target.value)} className={inputClass} placeholder="כתובת" />
          </div>
          <div className="sm:col-span-2">
            <Label>תיאור העסק</Label>
            <textarea value={p.businessDescription} onChange={e => update("businessDescription", e.target.value)} className={inputClass} rows={3} placeholder="תאר את העסק בקצרה" />
          </div>
          <div>
            <Label>גישת CRM (לדוחות)</Label>
            <select value={p.crmAccess} onChange={e => update("crmAccess", e.target.value)} className={inputClass}>
              <option value="none">אין — עוצרים בליד/רכישה שהפלטפורמה יודעת</option>
              <option value="connected">מחובר — אפשר סגירות ו-ROAS אמיתי</option>
            </select>
            <p className="mt-1 text-[11px] text-brand-muted">סוג המשפך (דף נחיתה / טופס לידים) מזוהה אוטומטית מנתוני הקמפיינים</p>
          </div>
        </div>
        <SaveBtn
          onClick={async () => {
            await Promise.all([
              patchSection("business", { businessSector: p.businessSector, businessDescription: p.businessDescription, serviceArea: p.serviceArea, serviceAreaDetails: p.serviceAreaDetails, physicalAddress: p.physicalAddress, crmAccess: p.crmAccess }),
              patchClient({ website: website.trim() }),
            ]);
          }}
          saved={!!savedMap.business}
        />
      </Section>

      {/* 2. מוצרים ושירותים */}
      <Section title="מוצרים ושירותים" icon={<ShoppingBag className="h-4 w-4 text-brand-gold" />}>
        <div className="space-y-4">
          {p.products.map((prod, i) => (
            <div key={i} className="rounded-lg border border-brand-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-muted">מוצר {i + 1}</span>
                <button onClick={() => removeProduct(i)} className={btnDanger}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>שם</Label><input value={prod.name} onChange={e => updateProduct(i, "name", e.target.value)} className={inputClass} /></div>
                <div>
                  <Label>מודל תמחור</Label>
                  <select value={prod.pricingModel} onChange={e => updateProduct(i, "pricingModel", e.target.value)} className={inputClass}>
                    <option value="">בחר</option>
                    {["חד פעמי", "מנוי", "פגישה", "פר פרויקט", "אחר"].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div><Label>טווח מחירים</Label><input value={prod.priceRange} onChange={e => updateProduct(i, "priceRange", e.target.value)} className={inputClass} /></div>
                <div><Label>עונתיות</Label><input value={prod.seasonality} onChange={e => updateProduct(i, "seasonality", e.target.value)} className={inputClass} /></div>
                <div className="sm:col-span-2"><Label>תיאור</Label><textarea value={prod.description} onChange={e => updateProduct(i, "description", e.target.value)} className={inputClass} rows={2} /></div>
                <div className="sm:col-span-2"><Label>מבצעים</Label><input value={prod.promotions} onChange={e => updateProduct(i, "promotions", e.target.value)} className={inputClass} /></div>
              </div>
            </div>
          ))}
          <button onClick={addProduct} className={btnPrimary + " flex items-center gap-1.5"}><Plus className="h-3.5 w-3.5" /> הוסף מוצר/שירות</button>
        </div>
        <SaveBtn onClick={() => patchSection("products", { products: p.products })} saved={!!savedMap.products} />
      </Section>

      {/* 3. USP ומיצוב */}
      <Section title="USP ומיצוב" icon={<Award className="h-4 w-4 text-brand-gold" />}>
        <div className="space-y-3">
          <div><Label>הצעת ערך ייחודית (USP)</Label><input value={p.usp} onChange={e => update("usp", e.target.value)} className={inputClass} /></div>
          <div><Label>יתרון תחרותי</Label><textarea value={p.competitiveAdvantage} onChange={e => update("competitiveAdvantage", e.target.value)} className={inputClass} rows={2} /></div>
          <div><Label>למה לבחור בנו?</Label><textarea value={p.whyChooseUs} onChange={e => update("whyChooseUs", e.target.value)} className={inputClass} rows={2} /></div>
          <div><Label>הוכחה חברתית</Label><textarea value={p.socialProof} onChange={e => update("socialProof", e.target.value)} className={inputClass} rows={2} /></div>
          <div><Label>חסמי כניסה</Label><textarea value={p.entryBarriers} onChange={e => update("entryBarriers", e.target.value)} className={inputClass} rows={2} /></div>
          <div><Label>התנגדויות נפוצות</Label><textarea value={p.objections} onChange={e => update("objections", e.target.value)} className={inputClass} rows={2} /></div>
        </div>
        <SaveBtn onClick={() => patchSection("usp", { usp: p.usp, competitiveAdvantage: p.competitiveAdvantage, whyChooseUs: p.whyChooseUs, socialProof: p.socialProof, entryBarriers: p.entryBarriers, objections: p.objections })} saved={!!savedMap.usp} />
      </Section>

      {/* 4. קהלי יעד */}
      <Section title="קהלי יעד" icon={<Users className="h-4 w-4 text-brand-gold" />}>
        <div className="space-y-4">
          <div>
            <Label>רמות מודעות</Label>
            <div className="flex flex-wrap gap-3 mt-1">
              {awarenessOptions.map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5 text-sm text-brand-dark cursor-pointer">
                  <input type="checkbox" checked={p.awarenessLevels.includes(opt.value)} onChange={() => toggleAwareness(opt.value)} className="accent-brand-gold" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          {p.awarenessLevels.map(level => {
            const aud = p.audiences[level] || emptyAudience();
            const label = awarenessOptions.find(o => o.value === level)?.label || level;
            return (
              <div key={level} className="rounded-lg border border-brand-border p-3 space-y-3">
                <span className="text-xs font-semibold text-brand-gold">{label}</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>דמוגרפיה</Label><input value={aud.demographics} onChange={e => updateAudience(level, "demographics", e.target.value)} className={inputClass} /></div>
                  <div><Label>תחומי עניין</Label><input value={aud.interests} onChange={e => updateAudience(level, "interests", e.target.value)} className={inputClass} /></div>
                  <div><Label>תחושות</Label><input value={aud.feelings} onChange={e => updateAudience(level, "feelings", e.target.value)} className={inputClass} /></div>
                  <div><Label>מילות מפתח</Label><input value={aud.keywords} onChange={e => updateAudience(level, "keywords", e.target.value)} className={inputClass} /></div>
                </div>
                <div>
                  <Label>סוגי תוכן</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {contentTypeOptions.map(ct => (
                      <label key={ct} className="flex items-center gap-1 text-xs text-brand-dark cursor-pointer">
                        <input type="checkbox" checked={aud.contentTypes?.includes(ct) || false} onChange={() => {
                          const has = aud.contentTypes?.includes(ct);
                          updateAudience(level, "contentTypes", has ? aud.contentTypes.filter((c: string) => c !== ct) : [...(aud.contentTypes || []), ct]);
                        }} className="accent-brand-gold" />
                        {ct}
                      </label>
                    ))}
                  </div>
                </div>
                <div><Label>הערות</Label><textarea value={aud.notes} onChange={e => updateAudience(level, "notes", e.target.value)} className={inputClass} rows={2} /></div>
              </div>
            );
          })}
        </div>
        <SaveBtn onClick={() => patchSection("audiences", { awarenessLevels: p.awarenessLevels, audiences: p.audiences })} saved={!!savedMap.audiences} />
      </Section>

      {/* 5. שפה וטון */}
      <Section title="שפה וטון" icon={<Globe className="h-4 w-4 text-brand-gold" />}>
        <div className="space-y-3">
          <div>
            <Label>שפות שיווק</Label>
            <div className="flex flex-wrap gap-3 mt-1">
              {["עברית", "אנגלית", "ערבית", "רוסית"].map(lang => (
                <label key={lang} className="flex items-center gap-1.5 text-sm text-brand-dark cursor-pointer">
                  <input type="checkbox" checked={p.marketingLanguages.includes(lang)} onChange={() => {
                    const has = p.marketingLanguages.includes(lang);
                    update("marketingLanguages", has ? p.marketingLanguages.filter(l => l !== lang) : [...p.marketingLanguages, lang]);
                  }} className="accent-brand-gold" />
                  {lang}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>טון דיבור</Label>
            <select value={p.toneOfVoice} onChange={e => update("toneOfVoice", e.target.value)} className={inputClass}>
              <option value="">בחר</option>
              {["רשמי", "ידידותי", "צעיר", "מקצועי", "שנון", "יוקרתי", "פרובוקטיבי"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <Label>סגנון פנייה</Label>
            <select value={p.addressStyle} onChange={e => update("addressStyle", e.target.value)} className={inputClass}>
              <option value="">בחר</option>
              {["אתה", "את", "אתם", "גוף שלישי"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><Label>מילים אסורות</Label><textarea value={p.forbiddenWords} onChange={e => update("forbiddenWords", e.target.value)} className={inputClass} rows={2} placeholder="מילים שלא להשתמש בהן" /></div>
        </div>
        <SaveBtn onClick={() => patchSection("language", { marketingLanguages: p.marketingLanguages, toneOfVoice: p.toneOfVoice, forbiddenWords: p.forbiddenWords, addressStyle: p.addressStyle })} saved={!!savedMap.language} />
      </Section>

      {/* 6. מתחרים */}
      <Section title="מתחרים" icon={<Target className="h-4 w-4 text-brand-gold" />}>
        <div className="space-y-4">
          {p.competitors.map((comp, i) => (
            <div key={i} className="rounded-lg border border-brand-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-muted">מתחרה {i + 1}</span>
                <button onClick={() => removeCompetitor(i)} className={btnDanger}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>שם</Label><input value={comp.name} onChange={e => updateCompetitor(i, "name", e.target.value)} className={inputClass} /></div>
                <div><Label>אתר</Label><input value={comp.website} onChange={e => updateCompetitor(i, "website", e.target.value)} className={inputClass} /></div>
                <div><Label>פייסבוק</Label><input value={comp.facebook} onChange={e => updateCompetitor(i, "facebook", e.target.value)} className={inputClass} /></div>
                <div><Label>אינסטגרם</Label><input value={comp.instagram} onChange={e => updateCompetitor(i, "instagram", e.target.value)} className={inputClass} /></div>
                <div className="sm:col-span-2"><Label>Ad Library</Label><input value={comp.adLibrary} onChange={e => updateCompetitor(i, "adLibrary", e.target.value)} className={inputClass} /></div>
                <div><Label>חוזקות</Label><textarea value={comp.strengths} onChange={e => updateCompetitor(i, "strengths", e.target.value)} className={inputClass} rows={2} /></div>
                <div><Label>חולשות</Label><textarea value={comp.weaknesses} onChange={e => updateCompetitor(i, "weaknesses", e.target.value)} className={inputClass} rows={2} /></div>
                <div className="sm:col-span-2"><Label>הערות</Label><input value={comp.notes} onChange={e => updateCompetitor(i, "notes", e.target.value)} className={inputClass} /></div>
              </div>
            </div>
          ))}
          {p.competitors.length < 5 && (
            <button onClick={addCompetitor} className={btnPrimary + " flex items-center gap-1.5"}><Plus className="h-3.5 w-3.5" /> הוסף מתחרה</button>
          )}
        </div>
        <SaveBtn onClick={() => patchSection("competitors", { competitors: p.competitors })} saved={!!savedMap.competitors} />
      </Section>

      {/* 7. נכסים ויזואליים */}
      <Section title="נכסים ויזואליים" icon={<Palette className="h-4 w-4 text-brand-gold" />}>
        <div className="space-y-3">
          <div>
            <Label>צבעי מותג (עד 5)</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {p.brandColors.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input type="color" value={c} onChange={e => updateColor(i, e.target.value)} className="h-8 w-8 cursor-pointer rounded border border-brand-border" />
                  <span className="text-xs text-brand-muted">{c}</span>
                  <button onClick={() => removeColor(i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              {p.brandColors.length < 5 && (
                <button onClick={addColor} className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-brand-border text-brand-muted hover:border-brand-gold"><Plus className="h-3.5 w-3.5" /></button>
              )}
            </div>
          </div>
          <div><Label>לוגו (URL)</Label><input value={p.logoUrl} onChange={e => update("logoUrl", e.target.value)} className={inputClass} placeholder="https://..." /></div>
          <div>
            <Label>סגנון עיצוב מודעות</Label>
            <select value={p.adDesignStyle} onChange={e => update("adDesignStyle", e.target.value)} className={inputClass}>
              <option value="">בחר</option>
              {["מינימליסטי", "צבעוני", "טקסטואלי", "וידאו מרכזי", "מיקס"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><Label>בנק נכסים (URL)</Label><input value={p.assetBankUrl} onChange={e => update("assetBankUrl", e.target.value)} className={inputClass} placeholder="https://..." /></div>
        </div>
        <SaveBtn onClick={() => patchSection("visual", { brandColors: p.brandColors, logoUrl: p.logoUrl, adDesignStyle: p.adDesignStyle, assetBankUrl: p.assetBankUrl })} saved={!!savedMap.visual} />
      </Section>

      {/* 8. פרטים כספיים — admin only */}
      {userRole === "admin" && (
        <Section title="פרטים כספיים" icon={<DollarSign className="h-4 w-4 text-brand-gold" />}>
          <div className="space-y-3">
            <div>
              <Label>תקציב חודשי</Label>
              <div className={inputClass + " bg-brand-bg/50 text-brand-muted cursor-default"}>
                {clientData.currency === "ILS" ? "₪" : clientData.currency} {clientData.monthlyBudget?.toLocaleString("he-IL") || "—"}
              </div>
            </div>
            <div>
              <Label>מקור ליד</Label>
              <select value={p.leadSource} onChange={e => update("leadSource", e.target.value)} className={inputClass}>
                <option value="">בחר</option>
                {["ליד", "הפניה", "אורגני", "פרסום", "אחר"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <Label>ערך לקוח לכל החיים (LTV)</Label>
              <input type="number" value={p.lifetimeValue || ""} onChange={e => update("lifetimeValue", Number(e.target.value))} className={inputClass} placeholder="0" />
            </div>
          </div>
          <SaveBtn onClick={() => patchSection("financial", { leadSource: p.leadSource, lifetimeValue: p.lifetimeValue })} saved={!!savedMap.financial} />
        </Section>
      )}

      {/* 9. מסמכים — admin only */}
      {userRole === "admin" && (
        <Section title="מסמכים" icon={<FileText className="h-4 w-4 text-brand-gold" />}>
          <div className="space-y-4">
            {p.documents.map((doc, i) => (
              <div key={i} className="rounded-lg border border-brand-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-muted">מסמך {i + 1}</span>
                  <button onClick={() => removeDoc(i)} className={btnDanger}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>שם</Label><input value={doc.name} onChange={e => updateDoc(i, "name", e.target.value)} className={inputClass} /></div>
                  <div>
                    <Label>סוג</Label>
                    <select value={doc.type} onChange={e => updateDoc(i, "type", e.target.value)} className={inputClass}>
                      <option value="">בחר</option>
                      {["חוזה", "הצעת מחיר", "נספח", "בריף", "אחר"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div><Label>תאריך</Label><input type="date" value={doc.date} onChange={e => updateDoc(i, "date", e.target.value)} className={inputClass} /></div>
                  <div><Label>קישור לקובץ</Label><input value={doc.fileUrl} onChange={e => updateDoc(i, "fileUrl", e.target.value)} className={inputClass} placeholder="https://..." /></div>
                </div>
              </div>
            ))}
            <button onClick={addDoc} className={btnPrimary + " flex items-center gap-1.5"}><Plus className="h-3.5 w-3.5" /> הוסף מסמך</button>
          </div>
          <SaveBtn onClick={() => patchSection("documents", { documents: p.documents })} saved={!!savedMap.documents} />
        </Section>
      )}

      {/* 10. הערות פנימיות */}
      <Section title="הערות פנימיות" icon={<MessageSquare className="h-4 w-4 text-brand-gold" />}>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={noteInput} onChange={e => setNoteInput(e.target.value)} className={inputClass} placeholder="הוסף הערה..." onKeyDown={e => e.key === "Enter" && addNote()} />
            <button onClick={addNote} className={btnPrimary + " flex-shrink-0 flex items-center gap-1.5"}><Plus className="h-3.5 w-3.5" /> הוסף הערה</button>
          </div>
          {p.internalNotes.length > 0 && (
            <div className="relative border-r-2 border-brand-gold/30 pr-4 space-y-3">
              {p.internalNotes.map((note, i) => (
                <div key={i} className="relative">
                  <div className="absolute -right-[1.3rem] top-1 h-2.5 w-2.5 rounded-full bg-brand-gold" />
                  <div className="rounded-lg border border-brand-border bg-brand-bg p-3">
                    <p className="text-sm text-brand-dark">{note.content}</p>
                    <div className="mt-1 flex gap-3 text-xs text-brand-muted">
                      <span>{note.author}</span>
                      <span>{new Date(note.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <SaveBtn onClick={() => patchSection("notes", { internalNotes: p.internalNotes })} saved={!!savedMap.notes} />
      </Section>
    </div>
  );
}
