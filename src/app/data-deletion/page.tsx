import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * דף ציבורי למחיקת נתונים (Meta Data Deletion).
 * עם ?code= — מציג את סטטוס בקשת המחיקה. בלי code — משמש כדף ההנחיות
 * (Data Deletion Instructions URL) שפייסבוק דורש.
 */
export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const request = code
    ? await prisma.dataDeletionRequest.findUnique({ where: { confirmationCode: code } })
    : null;

  return (
    <div dir="rtl" style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "48px auto", padding: 24, lineHeight: 1.7, color: "#111" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>מחיקת נתונים — DigiTailors</h1>

      {code ? (
        request ? (
          <div style={{ background: "#f0fdf4", border: "1px solid #22c55e", borderRadius: 8, padding: 20, marginTop: 16 }}>
            <p style={{ fontWeight: 600, color: "#15803d" }}>✓ בקשת המחיקה הושלמה</p>
            <p style={{ marginTop: 8 }}>קוד אישור: <code>{request.confirmationCode}</code></p>
            <p>תאריך: {request.createdAt.toLocaleDateString("he-IL")}</p>
            <p>{request.deletedCount > 0 ? `נמחקו ${request.deletedCount} רשומות מהמערכת.` : "לא נמצאו נתונים של המשתמש במערכת — אין מה למחוק."}</p>
          </div>
        ) : (
          <div style={{ background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 8, padding: 20, marginTop: 16 }}>
            <p style={{ color: "#b91c1c" }}>לא נמצאה בקשת מחיקה עם הקוד הזה.</p>
          </div>
        )
      ) : (
        <div style={{ marginTop: 16 }}>
          <p>
            DigiTailors מנהלת קמפיינים פרסומיים עבור לקוחותיה. במסגרת זו נשמר מטמון (cache) של הודעות
            ותגובות מעמודי הפייסבוק והאינסטגרם של הלקוחות.
          </p>
          <p style={{ marginTop: 12 }}>
            כדי לבקש מחיקה של הנתונים שלך, נהוג לשלוח בקשה דרך הגדרות פייסבוק שלך (Settings → Apps and
            Websites), והמערכת שלנו תמחק אוטומטית כל נתון המשויך אליך. לחלופין ניתן לפנות אלינו במייל:
          </p>
          <p style={{ marginTop: 12, fontWeight: 600 }}>privacy@digitailors.co.il</p>
        </div>
      )}
    </div>
  );
}
