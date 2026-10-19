import { cn } from "@/lib/utils";

export function LogoWordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]">
        <svg viewBox="0 0 24 24" className="size-4.5 text-brand-foreground" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 18V6l12 12V6" />
        </svg>
      </span>
      {compact ? null : (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Nexus<span className="text-muted-foreground"> Admin</span>
        </span>
      )}
    </span>
  );
}
