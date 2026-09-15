"use client";

// גלריית נכסי המותג שהלקוח העלה בשאלון הכניסה — מוצגת בתעודת הזהות.
// תמונות כתמונות-ממוזערות, סרטונים/פונטים/מסמכים ככרטיסי קובץ עם פתיחה והורדה.
// הקבצים באחסון פרטי — נטענים דרך פרוקסי מאומת (/api/blob/onboarding).
import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Film, Type, FolderOpen } from "lucide-react";

interface UploadedFile { url: string; name: string }
interface Assets {
  brandFiles: UploadedFile[];
  mediaFiles: UploadedFile[];
  colors: string;
  fontsNote: string;
  folderUrl: string;
}

type Kind = "image" | "video" | "font" | "doc";
function kindOf(f: UploadedFile): Kind {
  const n = `${f.name} ${f.url}`.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|svg)(\?|\s|$)/.test(n)) return "image";
  if (/\.(mp4|mov|webm)(\?|\s|$)/.test(n)) return "video";
  if (/\.(woff2?|ttf|otf)(\?|\s|$)/.test(n)) return "font";
  return "doc";
}
const proxied = (url: string, download = false) =>
  `/api/blob/onboarding?url=${encodeURIComponent(url)}${download ? "&download=1" : ""}`;

function FileCard({ f }: { f: UploadedFile }) {
  const kind = kindOf(f);
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = kind === "video" ? Film : kind === "font" ? Type : FileText;

  return (
    <div className="group overflow-hidden rounded-lg border border-brand-border bg-brand-light shadow-sm transition-shadow hover:shadow">
      {kind === "image" && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={proxied(f.url)} target="_blank" rel="noreferrer" className="block">
          <img src={proxied(f.url)} alt={f.name} onError={() => setImgFailed(true)}
            className="h-24 w-full bg-[repeating-conic-gradient(#f0f0f0_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] object-contain p-2" />
        </a>
      ) : (
        <a href={proxied(f.url)} target="_blank" rel="noreferrer"
          className="flex h-24 w-full items-center justify-center bg-brand-bg text-brand-muted transition-colors group-hover:text-brand-dark">
          <Icon className="h-8 w-8" />
        </a>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-brand-border px-2.5 py-1.5">
        <span className="truncate text-xs text-brand-dark" title={f.name}>{f.name}</span>
        <span className="flex shrink-0 gap-1.5">
          <a href={proxied(f.url)} target="_blank" rel="noreferrer" title="פתח" className="text-brand-muted hover:text-brand-dark"><ExternalLink className="h-3.5 w-3.5" /></a>
          <a href={proxied(f.url, true)} title="הורד" className="text-brand-muted hover:text-brand-dark"><Download className="h-3.5 w-3.5" /></a>
        </span>
      </div>
    </div>
  );
}

export default function OnboardingAssets({ clientId }: { clientId: string }) {
  const [assets, setAssets] = useState<Assets | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/questionnaire`)
      .then((r) => r.json())
      .then((d) => { if (d?.assets) setAssets(d.assets); })
      .catch(() => {});
  }, [clientId]);

  if (!assets) return null;
  const hasAny = assets.brandFiles.length || assets.mediaFiles.length || assets.colors || assets.fontsNote || assets.folderUrl;
  if (!hasAny) return null;

  return (
    <div className="mb-4 rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-3.5">
      <p className="mb-3 text-xs font-semibold text-brand-dark">📥 נכסים שהלקוח העלה בשאלון הכניסה</p>

      {assets.brandFiles.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-medium text-brand-muted">מיתוג — לוגו, ספר מותג, פונטים</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {assets.brandFiles.map((f, i) => <FileCard key={i} f={f} />)}
          </div>
        </div>
      )}

      {assets.mediaFiles.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-medium text-brand-muted">תמונות וסרטונים</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {assets.mediaFiles.map((f, i) => <FileCard key={i} f={f} />)}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-brand-muted">
        {assets.colors && <span>🎨 צבעים: <b className="text-brand-dark">{assets.colors}</b></span>}
        {assets.fontsNote && <span>🔤 פונטים: <b className="text-brand-dark">{assets.fontsNote}</b></span>}
        {assets.folderUrl && (
          <a href={assets.folderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-dark underline decoration-brand-gold hover:decoration-2">
            <FolderOpen className="h-3.5 w-3.5" /> תיקיית נכסים חיצונית
          </a>
        )}
      </div>
    </div>
  );
}
