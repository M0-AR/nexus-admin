import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-[var(--animate-shimmer)] rounded-md bg-[linear-gradient(90deg,var(--muted)_25%,var(--card-elevated)_50%,var(--muted)_75%)] bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 py-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-5", c === 0 && "w-4/5", c === cols - 1 && "w-1/3 justify-self-end")} />
          ))}
        </div>
      ))}
    </div>
  );
}
