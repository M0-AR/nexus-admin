"use client";

import { createContext, useContext, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

const SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

const DialogTitleContext = createContext<string | undefined>(undefined);

/** Open dialog ids, innermost last. Escape only dismisses the top-most popup. */
const openStack: string[] = [];

/**
 * Focus history. React applies `autoFocus` during commit, before effects run,
 * so `document.activeElement` at effect time is already inside the dialog.
 * The element to restore is the last focused one *outside* this dialog.
 */
const focusHistory: HTMLElement[] = [];
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      focusHistory.push(target);
      if (focusHistory.length > 30) focusHistory.shift();
    },
    true,
  );
}

function lastFocusedOutside(node: HTMLElement | null): HTMLElement | null {
  for (let i = focusHistory.length - 1; i >= 0; i -= 1) {
    const el = focusHistory[i];
    if (el === node || node?.contains(el)) continue;
    if (el.isConnected) return el;
  }
  return null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  size = "md",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  size?: keyof typeof SIZES;
  className?: string;
  children: React.ReactNode;
}) {
  const dialogId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = lastFocusedOutside(dialogRef.current);
    openStack.push(dialogId);

    const onKey = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== dialogId) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const node = dialogRef.current;
      if (!node || node.contains(document.activeElement)) return;
      const target =
        node.querySelector<HTMLElement>("[data-autofocus]") ??
        node.querySelector<HTMLElement>(FOCUSABLE) ??
        node;
      target.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      const index = openStack.lastIndexOf(dialogId);
      if (index !== -1) openStack.splice(index, 1);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, dialogId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh] sm:pt-[12vh]">
      <div
        className="animate-fade-in fixed inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "animate-slide-up relative w-full rounded-xl border border-border bg-card shadow-[var(--shadow-pop)] outline-none",
          SIZES[size],
          className,
        )}
      >
        <DialogTitleContext.Provider value={titleId}>{children}</DialogTitleContext.Provider>
      </div>
    </div>
  );
}

export function DialogHeader({
  title,
  description,
  onClose,
  className,
}: {
  title: string;
  description?: string;
  onClose?: () => void;
  className?: string;
}) {
  const titleId = useContext(DialogTitleContext);
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div>
        <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {onClose ? (
        <button
          onClick={onClose}
          className="focus-brand -m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5", className)} {...props} />
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogHeader title={title} description={description} onClose={onClose} />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={loading} data-autofocus>
          Cancel
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
