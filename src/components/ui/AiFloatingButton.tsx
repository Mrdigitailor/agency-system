"use client";

import { useState } from "react";
import { Sparkles, X, ChevronDown } from "lucide-react";
import { useApp } from "@/lib/data/context";
import AiChatTab from "./AiChatTab";

// ─── Types ──────────────────────────────────────────────────────────

interface Props {
  clientId?: string;
  clientName?: string;
}

// ─── Component ──────────────────────────────────────────────────────

export default function AiFloatingButton({ clientId, clientName }: Props) {
  const { clients } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(clientId || "");
  const [selectedClientName, setSelectedClientName] = useState(clientName || "");
  const [showDropdown, setShowDropdown] = useState(false);

  // אם הועבר clientId — נשתמש בו ישירות
  const hasClient = !!(selectedClientId && selectedClientName);

  const handleSelectClient = (id: string, name: string) => {
    setSelectedClientId(id);
    setSelectedClientName(name);
    setShowDropdown(false);
  };

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      {/* ── כפתור צף ── */}
      <button
        onClick={handleToggle}
        className="fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold shadow-lg transition-transform duration-200 hover:scale-105"
        title="צ׳אט AI"
      >
        <Sparkles size={22} className="text-brand-dark" />
      </button>

      {/* ── פאנל צ׳אט ── */}
      {isOpen && (
        <div
          className="fixed bottom-0 left-0 z-50 flex w-96 flex-col overflow-hidden rounded-tr-lg border border-brand-border bg-white shadow-2xl"
          style={{ height: 600 }}
          dir="rtl"
        >
          {/* כותרת + כפתור סגירה */}
          <div className="flex items-center justify-between border-b border-brand-border bg-brand-dark px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-gold" />
              <span className="text-sm font-medium text-white">צ׳אט AI</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/60 transition-colors duration-200 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* תוכן */}
          <div className="flex-1 overflow-hidden">
            {hasClient ? (
              <AiChatTab
                clientId={selectedClientId}
                clientName={selectedClientName}
              />
            ) : (
              /* בחירת לקוח */
              <div className="flex flex-col items-center justify-center gap-4 p-6" dir="rtl">
                <Sparkles size={32} className="text-brand-gold" />
                <p className="text-sm text-brand-muted">
                  בחר לקוח כדי להתחיל שיחה
                </p>

                <div className="relative w-full">
                  <button
                    onClick={() => setShowDropdown((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark transition-colors duration-200 hover:border-brand-gold"
                  >
                    <span className="text-brand-muted">בחר לקוח...</span>
                    <ChevronDown size={16} className="text-brand-muted" />
                  </button>

                  {showDropdown && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-brand-border bg-white shadow-lg">
                      {clients.length === 0 && (
                        <p className="px-3 py-2 text-xs text-brand-muted">
                          אין לקוחות
                        </p>
                      )}
                      {clients.map((client) => (
                        <button
                          key={client.id}
                          onClick={() =>
                            handleSelectClient(client.id, client.name)
                          }
                          className="flex w-full px-3 py-2 text-right text-sm text-brand-dark transition-colors duration-200 hover:bg-brand-gold/10"
                        >
                          {client.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
