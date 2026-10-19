"use client";

import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pages,
  total,
  onPage,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-t border-border px-5 py-3.5", className)}>
      <p className="text-[12.5px] text-muted-foreground">
        Page <span className="tabular font-medium text-foreground">{page}</span> of{" "}
        <span className="tabular">{Math.max(1, pages)}</span> · {formatNumber(total)} total
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="focus-brand inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="focus-brand inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
