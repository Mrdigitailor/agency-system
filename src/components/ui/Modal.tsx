"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={cn(
          "max-h-[90vh] overflow-y-auto rounded-lg bg-brand-light shadow-lg",
          size === "sm" && "w-full max-w-md",
          size === "md" && "w-full max-w-lg",
          size === "lg" && "w-full max-w-2xl"
        )}
      >
        {/* כותרת */}
        <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
          <h2 className="text-lg font-semibold text-brand-dark">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* תוכן */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
