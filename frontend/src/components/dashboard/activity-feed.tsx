"use client";

import { Activity } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty";

function describe(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActivityFeed({
  data,
}: {
  data: Array<{ id: string; action: string; actorEmail: string; createdAt: string }>;
}) {
  return (
    <div className="card-sheen flex h-full flex-col rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="px-5 pt-5">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Activity</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">What your team did recently</p>
      </div>

      {data.length === 0 ? (
        <EmptyState icon={<Activity />} title="No activity yet" description="Actions across the workspace show up here." />
      ) : (
        <ol className="relative flex-1 px-5 py-5">
          <span className="absolute top-6 bottom-6 left-[26px] w-px bg-border" aria-hidden />
          {data.slice(0, 8).map((item) => (
            <li key={item.id} className="relative flex gap-3.5 pb-4 last:pb-0">
              <span className="relative z-10 mt-0.5 flex size-3 shrink-0 items-center justify-center">
                <span className="size-3 rounded-full border-2 border-card bg-brand" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-foreground">{describe(item.action)}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                  {item.actorEmail} · {relativeTime(item.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
