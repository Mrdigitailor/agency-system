// מדידת המשפך בצד הדפדפן: טוען את Tag Manager ואת תג ההמרות של גוגל אדס,
// ומדווח כל אבן דרך גם ל-dataLayer וגם ישירות להמרה שלה בגוגל אדס (בלי תגים ב-Tag Manager).
// המזהים כאן הם של המשפך שלנו. ללקוח יהיו מכל, חשבון והמרות משלו.

const GTM_ID = "GTM-5BP74DF5";
const ADS_ID = "AW-11217098706";

export type FunnelEvent = "funnel_lp_click" | "funnel_numbers_shown" | "funnel_lead" | "funnel_meeting_booked";

// פעולות ההמרה בחשבון הגוגל אדס של הסוכנות (379-864-4658)
const CONVERSIONS: Record<FunnelEvent, string> = {
  funnel_lp_click: `${ADS_ID}/A4bMCJ_uwZYdENKv3eQp`,       // משפך | מעבר לצ'אט (משנית)
  funnel_numbers_shown: `${ADS_ID}/rIJXCKGmyZYdENKv3eQp`,  // משפך | קיבל את המספרים (משנית)
  funnel_lead: `${ADS_ID}/EJA3CKSmyZYdENKv3eQp`,           // משפך | השאיר פרטים (ראשית)
  funnel_meeting_booked: `${ADS_ID}/riDBCKemyZYdENKv3eQp`, // משפך | קבע פגישה (משנית בינתיים)
};

type Win = Window & { dataLayer?: unknown[] };

// gtag חייב לדחוף את אובייקט arguments עצמו, לא מערך
function gtag(..._args: unknown[]) {
  const w = window as Win;
  w.dataLayer = w.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

/** טוען את כלי המדידה פעם אחת בעמוד */
export function loadTracking(): void {
  if (document.getElementById("gtm-loader")) return;
  const w = window as Win;
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const gtm = document.createElement("script");
  gtm.id = "gtm-loader"; gtm.async = true;
  gtm.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(gtm);

  gtag("js", new Date());
  gtag("config", ADS_ID);
  const ads = document.createElement("script");
  ads.async = true;
  ads.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`;
  document.head.appendChild(ads);
}

/** מדווח אבני דרך. done נקרא אחרי שהדיווח יצא (או אחרי 700 אלפיות שנייה), לשימוש לפני מעבר עמוד */
export function trackFunnel(events: string[] | undefined, done?: () => void): void {
  let finished = false;
  const finish = () => { if (!finished) { finished = true; done?.(); } };
  const w = window as Win;
  w.dataLayer = w.dataLayer ?? [];
  let waiting = false;
  for (const event of events ?? []) {
    w.dataLayer.push({ event });
    const sendTo = CONVERSIONS[event as FunnelEvent];
    if (!sendTo) continue;
    waiting = true;
    gtag("event", "conversion", { send_to: sendTo, event_callback: finish });
  }
  if (done) setTimeout(finish, waiting ? 700 : 0);
}
