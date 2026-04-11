"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, Unlink, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import Modal from "@/components/ui/Modal";

interface Asset {
  id: string;
  assetType: string;
  externalId: string;
  name: string;
  isSelected: boolean;
  extraData: Record<string, unknown>;
}

interface Connection {
  id: string;
  platform: string;
  accountName: string;
  accountEmail: string;
  connectedAt: string;
  lastSyncAt: string | null;
  tokenExpiry: string | null;
  assets: Asset[];
}

const PLATFORMS = [
  { id: "meta", label: "Meta (Facebook + Instagram)", color: "#0081FB", icon: "M" },
  { id: "google_ads", label: "Google Ads", color: "#4285F4", icon: "G" },
  { id: "tiktok", label: "TikTok Ads", color: "#000000", icon: "T" },
];

const ASSET_TYPE_LABELS: Record<string, string> = {
  ad_account: "חשבון מודעות",
  facebook_page: "עמוד פייסבוק",
  instagram: "אינסטגרם",
  pixel: "פיקסל / Dataset",
  google_ads_account: "Google Ads",
  ga4_property: "Google Analytics",
  tiktok_account: "TikTok",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PlatformConnections({ clientId }: { clientId: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [assetsModalPlatform, setAssetsModalPlatform] = useState<string | null>(null);
  const [assetSelections, setAssetSelections] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/connections`);
      if (res.ok) setConnections(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // כשהחיבורים מתעדכנים בזמן שהמודל פתוח — לוודא שכל הנכסים החדשים מופיעים ב-selections
  useEffect(() => {
    if (!assetsModalPlatform) return;
    const conn = connections.find((c) => c.platform === assetsModalPlatform);
    if (!conn) return;
    setAssetSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const asset of conn.assets) {
        if (!(asset.id in next)) {
          next[asset.id] = asset.isSelected;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [connections, assetsModalPlatform]);

  const handleConnect = async (platform: string) => {
    setConnectingPlatform(platform);
    try {
      // Meta — משתמש ב-OAuth flow האמיתי
      if (platform === "meta") {
        const res = await fetch(`/api/platforms/meta/connect?clientId=${clientId}`);
        const data = await res.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
          return;
        }
      }

      // פלטפורמות אחרות — דמו
      const res = await fetch(`/api/clients/${clientId}/connections/${platform}/connect`, { method: "POST" });
      const data = await res.json();

      if (data.authUrl && !data.authUrl.includes("NOT_SET")) {
        window.location.href = data.authUrl;
      } else {
        // מצב דמו — קוראים ישירות ל-callback
        window.location.href = `/api/clients/${clientId}/connections/${platform}/callback?code=demo_code`;
      }
    } catch {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm("האם לנתק את החיבור? תצטרך להתחבר מחדש.")) return;
    if (platform === "meta") {
      await fetch(`/api/platforms/meta/disconnect/${clientId}`, { method: "DELETE" });
    } else {
      await fetch(`/api/clients/${clientId}/connections/${platform}`, { method: "DELETE" });
    }
    await fetchConnections();
  };

  const [loadingMessage, setLoadingMessage] = useState("");

  const handleRefreshAssets = async (force = false) => {
    setRefreshingAssets(true);
    setLoadingMessage("טוען חשבונות מודעות, דפים, אינסטגרם ופיקסלים...");
    try {
      await fetch(`/api/platforms/meta/refresh-assets/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all", force }),
      });
      await fetchConnections();
    } finally {
      setRefreshingAssets(false);
      setLoadingMessage("");
    }
  };

  const handleSync = async (platform: string) => {
    if (platform !== "meta") return;
    setSyncingPlatform(platform);
    try {
      await fetch(`/api/platforms/meta/sync/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 90 }),
      });
      await fetchConnections();
    } finally {
      setSyncingPlatform(null);
    }
  };

  const openAssetsModal = (platform: string) => {
    const conn = connections.find((c) => c.platform === platform);
    if (!conn) return;
    const selections: Record<string, boolean> = {};
    for (const asset of conn.assets) selections[asset.id] = asset.isSelected;
    setAssetSelections(selections);
    setAssetsModalPlatform(platform);
  };

  const [savingStep, setSavingStep] = useState("");

  const saveAssetSelections = async () => {
    if (!assetsModalPlatform) return;
    setSaving(true);

    // שלב 1: שמירת בחירות (כל הנכסים — כולל פיקסלים — במכה אחת)
    setSavingStep("שומר בחירות...");
    await fetch(`/api/clients/${clientId}/connections/${assetsModalPlatform}/assets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections: assetSelections }),
    });

    // שלב 2: סנכרון נתונים אוטומטי ברקע (Meta בלבד)
    if (assetsModalPlatform === "meta") {
      setSavingStep("מתחיל סנכרון נתונים ברקע...");
      fetch(`/api/platforms/meta/sync/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 30, forceAll: false }),
      }).catch(() => {});
    }

    await fetchConnections();
    setSaving(false);
    setSavingStep("");
    setAssetsModalPlatform(null);
  };

  const connectedPlatforms = new Set(connections.map((c) => c.platform));
  const activeModalConnection = connections.find((c) => c.platform === assetsModalPlatform);

  if (loading) return <p className="text-sm text-brand-muted">טוען חיבורים...</p>;

  return (
    <div className="space-y-4">
      {/* חיבורים פעילים */}
      {connections.length > 0 && (
        <div className="space-y-2">
          {connections.map((conn) => {
            const platform = PLATFORMS.find((p) => p.id === conn.platform);
            const selectedCount = conn.assets.filter((a) => a.isSelected).length;
            return (
              <div key={conn.id} className="rounded-lg border border-brand-border bg-brand-bg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg font-bold text-white"
                      style={{ backgroundColor: platform?.color }}
                    >
                      {platform?.icon}
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-brand-dark">
                        {platform?.label}
                        <CheckCircle2 className="h-4 w-4 text-brand-success" />
                      </p>
                      <p className="text-xs text-brand-muted">
                        {conn.accountName} · מחובר מ-{formatDate(conn.connectedAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-brand-muted">
                        {selectedCount} נכסים נבחרו מתוך {conn.assets.length}
                        {conn.lastSyncAt && ` · סנכרון אחרון: ${formatDate(conn.lastSyncAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {conn.platform === "meta" && (
                      <button
                        onClick={() => handleSync(conn.platform)}
                        disabled={syncingPlatform === conn.platform}
                        className="flex items-center gap-1 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncingPlatform === conn.platform ? "animate-spin" : ""}`} />
                        {syncingPlatform === conn.platform ? "מסנכרן..." : "סנכרן עכשיו"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        // פתח מיד עם מה שיש ב-DB, רענן ברקע (כולל פיקסלים)
                        openAssetsModal(conn.platform);
                        handleRefreshAssets(true);
                      }}
                      disabled={refreshingAssets}
                      className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-bg disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshingAssets ? "animate-spin" : ""}`} />
                      {refreshingAssets ? (loadingMessage || "טוען...") : "ניהול נכסים"}
                    </button>
                    <button
                      onClick={() => handleDisconnect(conn.platform)}
                      className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-xs font-medium text-brand-danger hover:bg-red-50"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      נתק
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* כפתורי חיבור */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-brand-muted">חבר פלטפורמה חדשה:</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.filter((p) => !connectedPlatforms.has(p.id)).map((platform) => (
            <button
              key={platform.id}
              onClick={() => handleConnect(platform.id)}
              disabled={connectingPlatform === platform.id}
              className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-bg disabled:opacity-50"
            >
              {connectingPlatform === platform.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div
                  className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: platform.color }}
                >
                  {platform.icon}
                </div>
              )}
              חבר {platform.label.split(" ")[0]}
              <Link2 className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        {PLATFORMS.every((p) => connectedPlatforms.has(p.id)) && (
          <p className="text-xs text-brand-muted">כל הפלטפורמות מחוברות ✓</p>
        )}
      </div>

      {/* Modal בחירת נכסים */}
      <Modal
        isOpen={!!assetsModalPlatform}
        onClose={() => setAssetsModalPlatform(null)}
        title={`ניהול נכסים — ${PLATFORMS.find((p) => p.id === assetsModalPlatform)?.label ?? ""}`}
        size="lg"
      >
        {activeModalConnection && (
          <div className="space-y-4">
            <p className="text-sm text-brand-muted">
              בחר אילו נכסים רלוונטיים ללקוח הזה. רק הנכסים הנבחרים יופיעו בדוחות ובביצועים.
            </p>

            <div className="space-y-3">
              {Object.entries(
                activeModalConnection.assets.reduce<Record<string, Asset[]>>((acc, asset) => {
                  if (!acc[asset.assetType]) acc[asset.assetType] = [];
                  acc[asset.assetType].push(asset);
                  return acc;
                }, {})
              ).map(([type, assets]) => (
                <div key={type}>
                  <p className="mb-2 text-xs font-semibold text-brand-muted">
                    {ASSET_TYPE_LABELS[type] ?? type}
                  </p>
                  <div className="space-y-1">
                    {assets.map((asset) => (
                      <label
                        key={asset.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-brand-border bg-brand-bg p-3 hover:bg-brand-border/30"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={assetSelections[asset.id] ?? false}
                            onChange={(e) =>
                              setAssetSelections((prev) => ({ ...prev, [asset.id]: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-brand-border"
                          />
                          <div>
                            <p className="text-sm font-medium text-brand-dark">{asset.name}</p>
                            <p className="font-mono text-xs text-brand-muted">{asset.externalId}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
              <button
                onClick={() => setAssetsModalPlatform(null)}
                className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg"
              >
                ביטול
              </button>
              <button
                onClick={saveAssetSelections}
                disabled={saving}
                className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
              >
                {saving ? (savingStep || "שומר...") : "שמור וסנכרן"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
