// תבנית דוח הפוטנציאל — מבנה ונראות קבועים, מספרים משתנים.
// מוגש מהאפליקציה עצמה, לכן הפונטים והלוגו נטענים מנתיבי /public.
// כלל בית: אסור מקפים ארוכים בשום טקסט.
import type { ResearchResult } from "./research";
import type { Chain } from "./verdict";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ils = (n: number) => Math.round(n).toLocaleString("he-IL");
const dateIL = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

export interface ReportInput {
  businessName: string;
  serviceField: string;
  serviceArea: string;
  budget: number;
  paymentType: string;
  monthlyFee: number;
  lifetimeMonths: number;
  createdAt: Date;
}

export function renderReportHtml(input: ReportInput, r: ResearchResult, c: Chain): string {
  const title = input.businessName ? esc(input.businessName) : esc(input.serviceField);
  const top = r.kept.slice(0, 8);
  const maxVol = top[0]?.vol ?? 1;
  const rest = Math.max(r.kept.length - top.length, 0);
  const isRetainer = input.paymentType === "retainer" && input.monthlyFee > 0;
  const closeText = c.closeRate === 0.05 ? "פנייה אחת מכל 20" : "פנייה אחת מכל 10";
  const closeTierText = c.closeRate === 0.05 ? "הרף השמרני למוצרים מעל 1,500 ₪" : "הרף השמרני למוצרים עד 1,500 ₪";

  const bars = top.map((k) => `
    <div class="bar-row"><span class="kw">${esc(k.text)}</span><span class="track"><span class="fill" style="width:${Math.max(Math.round((k.vol / maxVol) * 100), 6)}%"></span></span><span class="vals"><b>${ils(k.vol)}</b> · ‎₪${Math.round(k.mid)} לקליק</span></div>`).join("");

  const fullValueCard = isRetainer ? `
    <div class="card gold">
      <div class="t">שווי לקוח מלא</div>
      <div class="big num-font">${ils(c.dealValueFull)} <small>₪</small></div>
      <p>השירות הוא ריטיינר: כל לקוח ממשיך לשלם <b>${ils(input.monthlyFee)} ₪ בחודש</b>. בהנחה שמרנית שהוא נשאר ${input.lifetimeMonths} חודשים, שווי הלקוח האמיתי גבוה משמעותית משווי העסקה הראשונה.</p>
    </div>` : `
    <div class="card gold">
      <div class="t">ולא שכחנו את ההמשך</div>
      <div class="big num-font">${ils(c.dealValueFirst)} <small>₪</small></div>
      <p>החישוב כאן שמרני במתכוון: הוא לא מביא בחשבון לקוחות חוזרים, הפניות מפה לאוזן, או מכירות המשך. כל אלה רק מוסיפים.</p>
    </div>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>דוח פוטנציאל · ${title}</title>
<style>
@font-face{font-family:'Ploni';src:url('/fonts/ploni-light-aaa.woff') format('woff');font-weight:300;font-display:swap}
@font-face{font-family:'Ploni';src:url('/fonts/ploni-regular-aaa.woff') format('woff');font-weight:400;font-display:swap}
@font-face{font-family:'Ploni';src:url('/fonts/ploni-medium-aaa.woff') format('woff');font-weight:500;font-display:swap}
@font-face{font-family:'Ploni';src:url('/fonts/ploni-demibold-aaa.woff') format('woff');font-weight:600;font-display:swap}
:root{--bg:#0a0908;--panel:#131110;--panel-2:#1a1714;--gold:#eed89b;--gold-deep:#c8ab5e;--gold-faint:rgba(238,216,155,.10);--ink:#f4f0e7;--ink-2:#b5ad9e;--ink-3:#7e776a;--line:#272319;--line-gold:rgba(238,216,155,.32)}
*{box-sizing:border-box}
body{margin:0;direction:rtl;background:var(--bg);color:var(--ink);font-family:'Ploni',sans-serif;font-weight:400;font-size:17px;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:840px;margin:0 auto;padding:0 26px 90px}
.num-font{font-variant-numeric:tabular-nums}
.cover{border-bottom:1px solid var(--line-gold);padding:34px 0 40px}
.cover-in{max-width:840px;margin:0 auto;padding:0 26px}
.cover-top{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:44px}
.cover-top img{height:44px;display:block}
.cover-top .doc{font-size:12px;letter-spacing:.28em;color:var(--gold-deep);font-weight:500}
.cover h1{margin:0;font-weight:300;font-size:clamp(30px,5.6vw,50px);line-height:1.2}
.cover h1 b{font-weight:600;color:var(--gold)}
.cover .meta{display:flex;margin-top:34px;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex-wrap:wrap}
.cover .m{padding:12px 22px;border-inline-start:1px solid var(--line);flex:1;min-width:150px}
.cover .m:first-child{border-inline-start:0}
.cover .m .k{font-size:11px;letter-spacing:.16em;color:var(--ink-3);margin-bottom:2px}
.cover .m .v{font-size:15px;font-weight:500}
.hero{padding:52px 0 46px;border-bottom:1px solid var(--line);text-align:center}
.hero .lbl{font-size:13px;letter-spacing:.24em;color:var(--ink-3);font-weight:500}
.hero .num{font-weight:600;font-size:clamp(42px,8.6vw,74px);line-height:1.05;color:var(--gold);margin:16px 0 8px;letter-spacing:-.015em}
.hero .num small{font-size:.42em;font-weight:300;color:var(--gold-deep)}
.hero .sub{font-size:17px;color:var(--ink-2);font-weight:300;max-width:52ch;margin:0 auto}
.hero .sub b{color:var(--ink);font-weight:500}
section{padding:52px 0 0}
.sec-head{display:flex;align-items:baseline;gap:16px;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:22px}
.sec-head .no{font-weight:300;font-size:15px;color:var(--gold-deep);letter-spacing:.1em}
.sec-head h2{margin:0;font-weight:600;font-size:clamp(20px,3vw,26px)}
.lead{color:var(--ink-2);font-weight:300;font-size:16.5px;max-width:62ch;margin:0 0 24px}
.lead b{color:var(--ink);font-weight:500}
.chart{display:flex;flex-direction:column;gap:10px}
.bar-row{display:grid;grid-template-columns:190px 1fr 130px;gap:14px;align-items:center}
.bar-row .kw{font-size:14.5px;color:var(--ink-2);text-align:right;line-height:1.3}
.bar-row .track{height:14px;background:var(--panel-2);border-radius:3px;overflow:hidden}
.bar-row .fill{height:100%;background:linear-gradient(270deg,var(--gold),var(--gold-deep));border-radius:3px}
.bar-row .vals{font-size:13px;color:var(--ink-3);white-space:nowrap;text-align:left}
.bar-row .vals b{color:var(--ink);font-weight:500}
.chart-foot{display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:14px;padding-top:12px;font-size:13.5px;color:var(--ink-3);flex-wrap:wrap;gap:8px}
.chart-foot b{color:var(--gold);font-weight:500;font-size:15px}
.ledger{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel)}
.lrow{display:grid;grid-template-columns:1fr auto;gap:16px;padding:15px 22px;border-top:1px solid var(--line);align-items:baseline}
.lrow:first-child{border-top:0}
.lrow .l{font-size:15.5px;color:var(--ink-2);font-weight:300}
.lrow .l small{display:block;font-size:12.5px;color:var(--ink-3);margin-top:1px}
.lrow .r{font-weight:600;font-size:19px;white-space:nowrap}
.lrow .r small{font-weight:300;font-size:12.5px;color:var(--ink-3);margin-inline-start:6px}
.lrow.head{background:var(--panel-2)}
.lrow.head .l,.lrow.head .r{font-weight:500;color:var(--ink)}
.lrow.total{background:var(--gold-faint);border-top:1px solid var(--line-gold)}
.lrow.total .l{color:var(--ink);font-weight:500}
.lrow.total .r{color:var(--gold);font-size:23px}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:24px 24px 22px}
.card.gold{border-color:var(--line-gold)}
.card .t{font-size:12px;letter-spacing:.18em;color:var(--ink-3);margin-bottom:12px;font-weight:500}
.card.gold .t{color:var(--gold-deep)}
.card .big{font-weight:600;font-size:clamp(25px,3.8vw,34px);line-height:1.15}
.card.gold .big{color:var(--gold)}
.card .big small{font-size:.5em;font-weight:300;color:var(--ink-3)}
.card p{margin:10px 0 0;font-size:14.5px;color:var(--ink-2);font-weight:300;line-height:1.65}
.card p b{color:var(--ink);font-weight:500}
.assume{border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:6px 0}
.assume .arow{display:grid;grid-template-columns:170px 1fr;gap:16px;padding:12px 22px;border-top:1px solid var(--line);font-size:14.5px}
.assume .arow:first-child{border-top:0}
.assume .arow .k{color:var(--gold-deep);font-weight:500;font-size:13.5px}
.assume .arow .v{color:var(--ink-2);font-weight:300;line-height:1.6}
.cta{margin-top:56px;text-align:center;border-top:1px solid var(--line-gold);padding:44px 20px 8px}
.cta h2{margin:0;font-weight:300;font-size:clamp(22px,3.6vw,32px)}
.cta h2 b{font-weight:600;color:var(--gold)}
.cta p{color:var(--ink-2);font-weight:300;max-width:50ch;margin:12px auto 24px}
.cta .btn{display:inline-block;background:var(--gold);color:#0a0908;font-weight:600;font-size:16.5px;border-radius:8px;padding:14px 40px;text-decoration:none}
footer{margin-top:60px;border-top:1px solid var(--line);padding-top:16px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
footer img{height:26px;opacity:.85}
footer span{font-size:11.5px;color:var(--ink-3);font-weight:300;max-width:60ch;line-height:1.5}
@media (max-width:640px){.duo{grid-template-columns:1fr}.bar-row{grid-template-columns:120px 1fr}.bar-row .vals{grid-column:1/-1;text-align:right;margin-top:-4px}.assume .arow{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="cover"><div class="cover-in">
  <div class="cover-top">
    <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor">
    <span class="doc">דוח פוטנציאל</span>
  </div>
  <h1>כמה שווה תקציב של ${ils(input.budget)} ₪ בגוגל <b>${input.businessName ? `ל${title}` : `לעסק בתחום ${title}`}</b></h1>
  <div class="meta">
    <div class="m"><div class="k">תחום</div><div class="v">${esc(input.serviceField)}</div></div>
    <div class="m"><div class="k">שוק</div><div class="v">${input.serviceArea ? esc(input.serviceArea) : "ישראל, עברית"}</div></div>
    <div class="m"><div class="k">מקור נתונים</div><div class="v">Google Keyword Planner</div></div>
    <div class="m"><div class="k">תאריך</div><div class="v num-font">${dateIL(input.createdAt)}</div></div>
  </div>
</div></div>
<div class="wrap">
<div class="hero">
  <div class="lbl">פוטנציאל הכנסה חודשי</div>
  <div class="num num-font">${ils(c.revenueFirst.head)} עד ${ils(c.revenueFirst.best)} <small>₪</small></div>
  <p class="sub">מעסקאות ראשונות בלבד.${isRetainer ? ` בשווי לקוח מלא, שמביא בחשבון שהשירות הוא ריטיינר מתמשך: <b>עד ${ils(c.revenueFull.best)} ₪ בחודש</b>.` : ""}</p>
</div>
<section>
  <div class="sec-head"><span class="no">01</span><h2>הביקוש בשוק</h2></div>
  <p class="lead">כ-${ils(r.totalVol)} חיפושים רלוונטיים בחודש. אלה הביטויים שאנשים באמת מקלידים כשהם מחפשים את השירות, אחרי שסיננו חיפושי מידע, מחפשי עבודה וקורסים. <b>המחיר לצד כל ביטוי הוא הצעת המחיר של גוגל עצמה לקליק.</b></p>
  <div class="chart num-font">${bars}
  </div>
  <div class="chart-foot"><span>${rest > 0 ? `ועוד ${rest} ביטויים רלוונטיים נוספים שנכללו בניתוח` : "כלל הביטויים הרלוונטיים שנמצאו"}</span><span>סה"כ: <b class="num-font">${ils(r.totalVol)}</b> חיפושים בחודש</span></div>
</section>
<section>
  <div class="sec-head"><span class="no">02</span><h2>מהתקציב ועד העסקה</h2></div>
  <p class="lead">חישוב שמרני, שלב אחרי שלב. כל שורה נובעת מהקודמת, וכל הנחה מפורטת בסעיף 05.</p>
  <div class="ledger num-font">
    <div class="lrow head"><span class="l">תקציב פרסום חודשי</span><span class="r">${ils(input.budget)} ₪</span></div>
    <div class="lrow"><span class="l">מחיר ממוצע לקליק<small>ממוצע משוקלל של הצעות המחיר של גוגל</small></span><span class="r">‎${Math.round(c.cpcMid)} ₪</span></div>
    <div class="lrow"><span class="l">כניסות לדף הנחיתה<small>בתרחיש אופטימי: עד ${ils(c.clicks.best)}</small></span><span class="r">‎~${ils(c.clicks.head)}<small>בחודש</small></span></div>
    <div class="lrow"><span class="l">פניות של מתעניינים<small>לפי 5% המרה מכניסה לפנייה</small></span><span class="r">‎${Math.round(c.leads.head)} עד ${Math.round(c.leads.best)}<small>בחודש</small></span></div>
    <div class="lrow"><span class="l">עסקאות חדשות<small>לפי סגירה של ${closeText}</small></span><span class="r">‎${c.deals.head} עד ${c.deals.best}<small>בחודש</small></span></div>
    <div class="lrow total"><span class="l">הכנסה חודשית מעסקאות ראשונות</span><span class="r">${ils(c.revenueFirst.head)} עד ${ils(c.revenueFirst.best)} ₪</span></div>
  </div>
</section>
<section>
  <div class="sec-head"><span class="no">03</span><h2>התמונה המלאה: עסקה מול לקוח</h2></div>
  <div class="duo">
    <div class="card">
      <div class="t">שווי עסקה ראשונה</div>
      <div class="big num-font">${ils(c.dealValueFirst)} <small>₪</small></div>
      <p>התשלום הראשון של כל לקוח חדש שנסגר.</p>
    </div>${fullValueCard}
  </div>
</section>
<section>
  <div class="sec-head"><span class="no">04</span><h2>על מה המספרים מבוססים</h2></div>
  <div class="assume">
    <div class="arow"><span class="k">מקור הנתונים</span><span class="v">כלי מילות המפתח של גוגל, נכון ל-${dateIL(input.createdAt)}. ישראל, עברית, רשת החיפוש בלבד.</span></div>
    <div class="arow"><span class="k">מחיר לקליק</span><span class="v">ממוצע משוקלל של הצעות המחיר של גוגל, באמצע הטווח. לא הקצה הזול ולא היקר.</span></div>
    <div class="arow"><span class="k">המרה בדף</span><span class="v">5% מהנכנסים משאירים פרטים. היעד השמרני שאנחנו עובדים לפיו.</span></div>
    <div class="arow"><span class="k">סגירת עסקאות</span><span class="v">${closeText} הופכת לעסקה. ${closeTierText}. גם אם אצלך זה חצי מזה, הכיוון נשאר.</span></div>${isRetainer ? `
    <div class="arow"><span class="k">אורך חיי לקוח</span><span class="v">${input.lifetimeMonths} חודשים, לפי הערכה שמרנית.</span></div>` : ""}
    <div class="arow"><span class="k">מה זה לא</span><span class="v">הערכת פוטנציאל, לא התחייבות. בפגישה נפרק את המספרים יחד, עד הפרט האחרון.</span></div>
  </div>
</section>
<div class="cta">
  <h2>רוצה לראות <b>איך הגענו לכל מספר?</b></h2>
  <p>בפגישה קצרה נעבור על הניתוח המלא של העסק שלך: הביטויים, המחירים, והדרך מהתקציב שלך לעסקאות ביומן.</p>
  <a class="btn" href="#booking">לתיאום פגישה</a>
</div>
<footer>
  <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor">
  <span>הופק אוטומטית על בסיס נתוני גוגל ונתוני העסק כפי שנמסרו. התוצאות בפועל תלויות בשוק, בהצעה וביכולת המכירה.</span>
</footer>
</div>
</body>
</html>`;
}

/** עמוד סטטוס פשוט לדוח שאינו מוכן (בהכנה / אין נתונים) */
export function renderReportFallback(status: string, reason?: string): string {
  const msg = status === "pending"
    ? "הדוח בהכנה, נסו לרענן בעוד רגע."
    : "לא הצלחנו להפיק מספרים אמינים לתחום הזה, ואנחנו מעדיפים לא לנחש. דברו איתנו ונעבור על זה יחד.";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>דוח פוטנציאל</title>
<style>body{margin:0;background:#0a0908;color:#f4f0e7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
.box{max-width:420px}h1{font-weight:600;font-size:22px;color:#eed89b}p{color:#b5ad9e;font-size:15px;line-height:1.7}</style></head>
<body><div class="box"><h1>${status === "pending" ? "עוד רגע..." : "נעדיף לדבר"}</h1><p>${msg}${reason ? `<br><small>(${esc(reason)})</small>` : ""}</p></div></body></html>`;
}
