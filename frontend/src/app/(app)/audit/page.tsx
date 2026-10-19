"use client";

import { useMemo, useState } from "react";
import { ScrollText, Search, ShieldCheck, X } from "lucide-react";
import type { AuditEntry, Paginated } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useDebounce } from "@/lib/hooks";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TH, THead, TR, TD } from "@/components/ui/table";

const PAGE_SIZE = 20;

function actionTone(action: string): "brand" | "success" | "warning" | "danger" | "neutral" {
  const lower = action.toLowerCase();
  if (lower.includes("delete") || lower.includes("remove") || lower.includes("revoke")) return "danger";
  if (lower.includes("create") || lower.includes("invite")) return "success";
  if (lower.includes("update") || lower.includes("rotate") || lower.includes("switch")) return "warning";
  if (lower.includes("login") || lower.includes("auth")) return "brand";
  return "neutral";
}

function humanize(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditPage() {
  const { features } = useWorkspace();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const debouncedAction = useDebounce(action, 300);

  const path = useMemo(() => {
    if (!features.audit_log) return null;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (debouncedAction.trim()) params.set("action", debouncedAction.trim());
    return `/audit?${params.toString()}`;
  }, [features.audit_log, page, debouncedQuery, debouncedAction]);

  const { data, loading, refreshing, error, reload } = useApi<Paginated<AuditEntry>>(path);

  if (!features.audit_log) {
    return (
      <div className="space-y-5">
        <p className="text-[13px] text-muted-foreground">Every sensitive action, with actor and request context.</p>
        <EmptyState
          icon={<ShieldCheck />}
          title="Audit log is not enabled on this plan"
          description="Upgrade to Starter or higher — or ask an owner to grant an audit_log feature override — to record and review every sensitive action."
          action={
            <a href="/settings?tab=billing">
              <Button size="sm">View plans</Button>
            </a>
          }
        />
      </div>
    );
  }

  const entries = data?.items ?? [];
  const filtered = Boolean(debouncedQuery.trim() || debouncedAction.trim());

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] text-muted-foreground">Every sensitive action, with actor and request context.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search actor, action, entity or IP…"
              className="pl-9"
              aria-label="Search audit events"
            />
          </div>
          <div className="relative w-44">
            <Input
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by action…"
              aria-label="Filter by action"
            />
            {action ? (
              <button
                onClick={() => {
                  setAction("");
                  setPage(1);
                }}
                className="focus-brand absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear action filter"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="py-16 text-center">
            <p className="text-[13.5px] text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title={filtered ? "No audit events match your filters" : "No audit events yet"}
            description={
              filtered
                ? "Try a different search term, or clear the action filter."
                : "Actions like logins, order updates, role changes and secret rotations will appear here."
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setAction("");
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className={`transition-opacity ${refreshing ? "opacity-60" : ""}`}>
              <Table>
                <THead>
                  <TR>
                    <TH className="hidden sm:table-cell">When</TH>
                    <TH>Actor</TH>
                    <TH>Action</TH>
                    <TH className="hidden md:table-cell">Entity</TH>
                    <TH className="hidden lg:table-cell">IP</TH>
                  </TR>
                </THead>
                <TBody>
                  {entries.map((entry) => (
                    <TR key={entry.id}>
                      <TD className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                        {formatDateTime(entry.createdAt)}
                      </TD>
                      <TD className="max-w-52 truncate font-medium text-foreground">{entry.actorEmail}</TD>
                      <TD>
                        <Badge tone={actionTone(entry.action)}>{humanize(entry.action)}</Badge>
                      </TD>
                      <TD className="hidden max-w-56 md:table-cell">
                        <span className="block truncate text-[12.5px] text-muted-foreground">
                          {entry.entity}
                          {entry.entityId ? (
                            <span className="tabular ml-1 font-mono text-[11.5px] text-muted-foreground">
                              {entry.entityId.slice(0, 13)}…
                            </span>
                          ) : null}
                        </span>
                      </TD>
                      <TD className="hidden tabular font-mono text-[12px] text-muted-foreground lg:table-cell">
                        {entry.ip ?? "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <Pagination page={data!.page} pages={data!.pages} total={data!.total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
