// לוגואים מובנים של פלטפורמות הפרסום — SVG inline, צבעי מותג רשמיים.
import React from "react";

export const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  meta: "Meta",
  facebook: "Facebook Ads",
  google_ads: "Google Ads",
  tiktok: "TikTok Ads",
  ga4: "Google Analytics",
  all: "כל הפלטפורמות",
};

/** הפלטפורמות שמרכיבות ווידג'ט — "all" מתפצל ל-3 לוגואים */
export function platformsOf(platform: string): string[] {
  if (platform === "all") return ["meta", "google_ads", "tiktok"];
  return [platform];
}

export function PlatformLogo({ platform, className = "h-5 w-5" }: { platform: string; className?: string }) {
  switch (platform) {
    case "meta":
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-label="Meta">
          <circle cx="12" cy="12" r="12" fill="#1877F2" />
          <path fill="#fff" d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.4-1.3h1.4V5.9c-.7-.1-1.4-.1-2.1-.1-2.1 0-3.5 1.3-3.5 3.6v2H8.3V14h2.3v7h2.9z" />
        </svg>
      );
    case "google_ads":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-label="Google Ads">
          <rect x="2.7" y="6" width="5.2" height="14.5" rx="2.6" fill="#FBBC04" transform="rotate(-28 5.3 13.2)" />
          <rect x="10.8" y="6" width="5.2" height="14.5" rx="2.6" fill="#4285F4" transform="rotate(28 13.4 13.2)" />
          <circle cx="6.4" cy="18.3" r="2.7" fill="#34A853" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-label="TikTok">
          <path fill="#25F4EE" d="M15.8 2.5c.3 1.9 1.4 3.4 3.2 3.9v1c-.1 0-.2 0-.3.1v2.4c-1.2 0-2.3-.4-3.2-1v5.7c0 2.9-2.3 5.2-5.2 5.2-1 0-2-.3-2.8-.8 1 .8 2.2 1.3 3.6 1.3 2.9 0 5.2-2.3 5.2-5.2V9.4c.9.6 2 1 3.2 1V7.9c-1.8-.5-2.9-2-3.2-3.9h-.5z" />
          <path fill="#000" d="M14.7 2.5c.3 1.9 1.4 3.4 3.2 3.9v2.4c-1.2 0-2.3-.4-3.2-1v5.7c0 2.9-2.3 5.2-5.2 5.2S4.3 16.4 4.3 13.5s2.3-5.2 5.2-5.2c.3 0 .6 0 .8.1v2.7c-.3-.1-.5-.1-.8-.1-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5V2.5h2.7z" />
          <path fill="#FE2C55" d="M15.8 2.5c.3 1.9 1.4 3.4 3.2 3.9v1c-1.5-.3-2.7-1.4-3.2-2.9h-.5c.1.7.3 1.3.5 2v9c0 2.9-2.3 5.2-5.2 5.2-1 0-2-.3-2.8-.8.9.6 2 1 3.1 1 2.9 0 5.2-2.3 5.2-5.2V8.8c.9.6 2 1 3.2 1V7.4c-1.5-.4-2.5-1.6-3-3z" opacity=".9" />
        </svg>
      );
    case "ga4":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-label="Google Analytics">
          <rect x="14.8" y="2.5" width="5.4" height="19" rx="2.7" fill="#F9AB00" />
          <rect x="9.3" y="9" width="5.4" height="12.5" rx="2.7" fill="#E37400" />
          <circle cx="6" cy="18.5" r="2.9" fill="#E37400" />
        </svg>
      );
    default:
      return null;
  }
}

/** שורת לוגואים לקוביית מידע — אחד או יותר */
export function PlatformLogos({ platforms, className }: { platforms: string[]; className?: string }) {
  const list = platforms.filter((p) => p && p !== "all");
  if (list.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {list.map((p) => (
        <PlatformLogo key={p} platform={p} className={className ?? "h-4 w-4"} />
      ))}
    </div>
  );
}
