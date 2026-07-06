# Agency Management System — Mr.digitailor

## סקירה כללית
מערכת ניהול פנימית לסוכנות שיווק ופרסום דיגיטלי.
מחליפה את Monday + כלי דוחות חיצוניים.
שפת ממשק: **עברית בלבד** (RTL מלא).

---

## מיתוג ועיצוב

### צבעי מותג
- **צבע ראשי (Primary):** `#eed89b` — זהב חם. משמש ל-CTA, כפתורים ראשיים, אלמנטים בולטים, הדגשות, אייקונים פעילים
- **צבע כהה (Dark):** `#000000` — שחור. משמש לרקע Sidebar, טקסטים ראשיים, כותרות, רקע Header
- **צבע בהיר (Light):** `#ffffff` — לבן. משמש לרקע אזור התוכן הראשי, כרטיסים, טקסט על רקע כהה

### גוונים משניים (ליצור מתוך הצבעים הראשיים)
- **רקע כללי של האפליקציה:** `#f5f5f5` — אפור בהיר מאוד
- **גבולות וקווים:** `#e0e0e0`
- **טקסט משני:** `#666666`
- **הצלחה (Success):** `#22c55e` — ירוק
- **אזהרה (Warning):** `#f59e0b` — כתום
- **סכנה (Danger):** `#ef4444` — אדום
- **מידע (Info):** `#3b82f6` — כחול

### סטטוסי לקוחות (צבעים + אייקונים)
- **תקין:** ירוק `#22c55e` + אייקון ✓
- **בסיכון:** כתום `#f59e0b` + אייקון ⚠
- **מוכן לאפסייל:** כחול `#3b82f6` + אייקון 🚀

### פונט
- **פונט ראשי:** Ploni — פונט מקצועי בעברית
- **קבצי פונט:** נמצאים בתיקייה `/public/fonts/`
  - `ploni-light-aaa.woff` — Light (300) — לטקסט משני, תיאורים
  - `ploni-regular-aaa.woff` — Regular (400) — לטקסט גוף רגיל
  - `ploni-medium-aaa.woff` — Medium (500) — לכותרות משניות, תפריטים
  - `ploni-demibold-aaa.woff` — DemiBold (600) — לכותרות ראשיות, KPI, מספרים בולטים
- **הגדרת @font-face בקובץ globals.css:**
```css
@font-face {
  font-family: 'Ploni';
  src: url('/fonts/ploni-light-aaa.woff') format('woff');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Ploni';
  src: url('/fonts/ploni-regular-aaa.woff') format('woff');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Ploni';
  src: url('/fonts/ploni-medium-aaa.woff') format('woff');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Ploni';
  src: url('/fonts/ploni-demibold-aaa.woff') format('woff');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
```
- **הגדרת Tailwind (tailwind.config.js):**
```js
fontFamily: {
  ploni: ['Ploni', 'sans-serif'],
}
```
- **שימוש:** `font-ploni` בכל האפליקציה כ-default

### לוגו
- **קובץ:** `logo-mrdigitailors.svg` — נמצא בתיקייה `/public/images/`
- **מיקום ב-Sidebar:** בראש ה-Sidebar, עם padding מספיק
- **רקע:** הלוגו מעוצב לרקע כהה (שחור) — לא להציג על רקע בהיר
- **גודל מומלץ ב-Sidebar:** רוחב מקסימלי 160px

### אווירת עיצוב
- **מודרני וחד** — קווים נקיים, ללא עיטורים מיותרים
- **פינות מעוגלות:** `rounded-lg` (8px) לכרטיסים ואלמנטים
- **צלליות:** עדינות בלבד — `shadow-sm` לכרטיסים
- **ריווח:** נדיב — לא לדחוס אלמנטים
- **Sidebar:** רקע שחור `#000000`, טקסט לבן, אייקונים בצבע זהב `#eed89b` כשפעילים
- **Header:** רקע לבן עם border-bottom עדין
- **כרטיסי KPI:** רקע לבן, border עדין, מספרים גדולים ב-DemiBold

### כללי עיצוב חשובים
- לא להשתמש בצבעי Bootstrap/Material — רק פלטת הצבעים שמוגדרת למעלה
- לא להשתמש בפונט Noto Sans Hebrew או כל פונט אחר — רק Ploni
- לשמור על קונסיסטנטיות — כל הכפתורים, כרטיסים, וטבלאות נראים אחיד
- מעברי צבע (hover) — עדינים, transition של 200ms
- אייקונים — להשתמש ב-Lucide React או Heroicons (סגנון outline)

---

## סטאק טכנולוגי
- **Frontend:** Next.js 14+ (App Router) + React + Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js (email + password, role-based)
- **Charts:** Recharts
- **Hosting:** Vercel / Railway
- **APIs:** Meta Marketing API, Google Ads API, TikTok Marketing API, GA4 Data API, Google Calendar API

## מבנה תיקיות
```
/src
  /app              # Next.js App Router pages
    /dashboard       # דשבורד בעלים
    /clients         # ניהול לקוחות
    /tasks           # משימות
    /crm             # CRM לידים
    /reports         # דוחות
    /settings        # הגדרות
    /client-portal   # ממשק לקוח קצה
  /components        # קומפוננטות משותפות
    /ui              # כפתורים, טפסים, כרטיסים
    /charts          # גרפים
    /tables          # טבלאות
    /layout          # Sidebar, Header, Navigation
  /lib               # פונקציות עזר
    /api             # חיבורי API לפלטפורמות פרסום
    /auth            # לוגיקת אימות
    /db              # Prisma client + queries
    /utils           # פונקציות כלליות
  /types             # TypeScript types
/public
  /fonts             # קבצי פונט Ploni
  /images            # לוגו ותמונות
/prisma
  schema.prisma      # סכמת בסיס נתונים
```

## רמות משתמשים (4 תפקידים)
1. **בעלים (Admin)** — רואה הכל: כל הלקוחות, כל העובדים, CRM, התראות
2. **סמנכ״ל / מנהל תיקים** — רואה את הלקוחות של הצוות שלו, משימות, חריגות
3. **מנהל קמפיינים** — רואה את הלקוחות שלו בלבד, משימות, יומן
4. **לקוח קצה** — דשבורד תוצאות + דוחות בלבד

## כללי פיתוח חשובים

### שפה וכיווניות
- כל הממשק בעברית
- כיוון RTL מלא — כולל טבלאות, גרפים, Sidebar
- תאריכים בפורמט ישראלי: DD/MM/YYYY
- מטבע: ₪ (שקלים)

### סגנון קוד
- TypeScript תמיד — אף פעם לא JS רגיל
- קומפוננטות פונקציונליות בלבד (React Hooks)
- Tailwind CSS לעיצוב — בלי CSS חיצוני (חוץ מ-globals.css לפונטים)
- שמות משתנים ופונקציות באנגלית, הערות בעברית
- כל קומפוננטה בקובץ נפרד

### בסיס נתונים
- Prisma ORM לכל האינטראקציות עם ה-DB
- Relations ברורים בין הטבלאות
- Soft delete ללקוחות ומשימות (שדה deletedAt)
- Timestamps אוטומטיים (createdAt, updatedAt)

### אבטחה
- בדיקת הרשאות בכל API Route לפי תפקיד
- לקוח קצה רואה רק את הנתונים שלו
- מנהל קמפיינים רואה רק את הלקוחות המשויכים אליו
- Rate limiting על API routes

### API חיצוניים
- שאיבת נתונים מפלטפורמות פרסום ב-cron jobs (לא בזמן אמת)
- שמירת הנתונים בטבלאות ייעודיות ב-DB
- ניהול tokens ורענון אוטומטי
- Error handling + retry logic

### התראות
- שמירה בטבלת alerts ב-DB
- הצגה בממשק כ-notification center
- סוגי התראות: ירידה בביצועים, משימה תקועה, דוח לא נשלח, חריגת תקציב, אופטימיזציה חסרה, לקוח מוכן לאפסייל

### דוחות
- דוח שבועי — נוצר אוטומטית מנתוני ה-API
- דוח חודשי — PDF מפורט עם גרפים
- מעקב: נשלח / לא נשלח + תאריך

## דגשים לדשבורד בעלים
- כרטיסי KPI עליונים: סה״כ לקוחות (פילוח לפי סטטוס), תקציב כולל, משימות פתוחות, התראות דחופות
- טבלת לקוחות עם עמודות: שם, מנהל, פלטפורמות, סטטוס (צבע + אייקון), תקציב, עמידה ביעדים, אופטימיזציה אחרונה, משימות פתוחות, דוחות
- פילטרים: סטטוס, מנהל, פלטפורמה, חריגה ביעדים, חיפוש
- סטטוסים: תקין (ירוק), בסיכון (כתום), מוכן לאפסייל (כחול)

## לא לשנות / לא לעשות
- לא לשנות את מבנה הרמות (4 תפקידים)
- לא לבטל RTL בשום מקום
- לא להשתמש ב-inline styles — רק Tailwind
- לא לחשוף API keys בצד הלקוח
- לא למחוק נתונים לצמיתות — תמיד soft delete
- לא להשתמש בפונט אחר מלבד Ploni
- לא להשתמש בפלטת צבעים שאינה מוגדרת למעלה
- לשאול לפני מחיקת קבצים
