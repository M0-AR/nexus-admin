"use client";

import { cloneElement, useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useClickOutside } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

export function DropdownMenu({
  trigger,
  items,
  align = "end",
  className,
  menuClassName,
}: {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const activeRef = useRef(-1);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const menuId = useId();

  const actionable = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.separator && !item.disabled);

  const moveActive = (next: number) => {
    activeRef.current = next;
    setActive(next);
  };

  useEffect(() => {
    if (!open) {
      activeRef.current = -1;
      setActive(-1);
      restoreRef.current?.focus();
      restoreRef.current = null;
      return;
    }
    restoreRef.current = document.activeElement as HTMLElement | null;
    const first = items.findIndex((item) => !item.separator && !item.disabled);
    moveActive(first);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key === "Tab") {
        setOpen(false);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
        return;
      }
      event.preventDefault();
      if (actionable.length === 0) return;
      const position = actionable.findIndex(({ index }) => index === activeRef.current);
      let next = position;
      if (event.key === "ArrowDown") next = position < 0 ? 0 : (position + 1) % actionable.length;
      else if (event.key === "ArrowUp") next = position < 0 ? actionable.length - 1 : (position - 1 + actionable.length) % actionable.length;
      else if (event.key === "Home") next = 0;
      else next = actionable.length - 1;
      moveActive(actionable[next].index);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.focus();
  }, [active, open]);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>
        {cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
          "aria-haspopup": "menu",
          "aria-expanded": open,
          "aria-controls": open ? menuId : undefined,
        })}
      </div>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className={cn(
            "animate-fade-in absolute z-40 mt-1.5 min-w-44 rounded-lg border border-border bg-card p-1.5 shadow-[var(--shadow-pop)]",
            align === "end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {items.map((item, index) =>
            item.separator ? (
              <div key={index} role="separator" className="my-1.5 h-px bg-border" />
            ) : (
              <button
                key={index}
                role="menuitem"
                data-index={index}
                tabIndex={active === index ? 0 : -1}
                disabled={item.disabled}
                onMouseEnter={() => moveActive(index)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpen(false);
                    item.onSelect?.();
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors outline-none",
                  "disabled:pointer-events-none disabled:opacity-40",
                  "focus-visible:bg-muted",
                  active === index && !item.disabled && "bg-muted",
                  item.danger
                    ? "text-danger hover:bg-danger-soft"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {item.icon ? <span className="text-muted-foreground [&>svg]:size-4">{item.icon}</span> : null}
                <span className="flex-1 truncate">{item.label}</span>
                {item.checked ? <Check className="size-3.5 text-brand-text" /> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
