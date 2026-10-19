"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "info";

interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

interface ToastApi {
  toast: (title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<Tone, { icon: React.ReactNode; accent: string }> = {
  success: { icon: <CheckCircle2 className="size-4.5 text-success" />, accent: "bg-success" },
  danger: { icon: <AlertTriangle className="size-4.5 text-danger" />, accent: "bg-danger" },
  info: { icon: <Info className="size-4.5 text-info" />, accent: "bg-info" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, title: string, description?: string) => {
      const id = ++counter.current;
      setItems((prev) => [...prev.slice(-4), { id, tone, title, description }]);
      setTimeout(() => dismiss(id), 4800);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: (title, description) => push("info", title, description),
      success: (title, description) => push("success", title, description),
      error: (title, description) => push("danger", title, description),
      info: (title, description) => push("info", title, description),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "danger" ? "alert" : "status"}
            aria-live={item.tone === "danger" ? "assertive" : "polite"}
            aria-atomic="true"
            className="animate-slide-up pointer-events-auto relative overflow-hidden rounded-lg border border-border bg-card p-3.5 pl-4 shadow-[var(--shadow-pop)]"
          >
            <span className={cn("absolute inset-y-0 left-0 w-0.5", TONES[item.tone].accent)} aria-hidden />
            <div className="flex items-start gap-2.5">
              <span className="mt-px" aria-hidden>
                {TONES[item.tone].icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-[12.5px] leading-snug break-words text-muted-foreground">{item.description}</p>
                ) : null}
              </div>
              <button
                onClick={() => dismiss(item.id)}
                className="focus-brand -m-1 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Dismiss notification: ${item.title}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
