"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Search, ShoppingCart, X } from "lucide-react";
import type { Order, OrderStatus, Paginated } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatCurrency } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useDebounce } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Badge, ORDER_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty";
import { DropdownMenu } from "@/components/ui/dropdown";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TH, THead, TR, TD } from "@/components/ui/table";
import { NewOrderDialog } from "@/components/orders/order-dialog";

const STATUSES: OrderStatus[] = ["PENDING", "PAID", "REFUNDED", "CANCELLED", "FAILED"];
const PAGE_SIZE = 10;

type SortField = "createdAt" | "amount" | "customer" | "number";

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersView />
    </Suspense>
  );
}

function OrdersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: errorToast } = useToast();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [sort, setSort] = useState<SortField>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    params.set("sort", sort);
    params.set("dir", dir);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (status) params.set("status", status);
    return `/orders?${params.toString()}`;
  }, [page, debouncedQuery, status, sort, dir]);

  const { data, loading, refreshing, error, reload, setData } = useApi<Paginated<Order>>(path);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setDialogOpen(true);
      router.replace("/orders");
    }
  }, [searchParams, router]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedQuery, status]);

  const changeStatus = async (order: Order, next: OrderStatus) => {
    if (order.status === next) return;
    setPendingId(order.id);
    try {
      const updated = await api.patch<Order>(`/orders/${order.id}/status`, { status: next });
      setData((prev) =>
        prev ? { ...prev, items: prev.items.map((o) => (o.id === order.id ? { ...o, ...updated } : o)) } : prev,
      );
      success(`${order.number} marked ${next.toLowerCase()}`);
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  const bulkStatus = async (next: OrderStatus) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const result = await api.patch<{ updated: number }>("/orders/bulk/status", {
        ids: Array.from(selected),
        status: next,
      });
      success(`${result.updated} order${result.updated === 1 ? "" : "s"} marked ${next.toLowerCase()}`);
      setSelected(new Set());
      reload();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const orders = data?.items ?? [];
  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDir(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const sortIcon = (field: SortField) =>
    sort === field ? (
      dir === "asc" ? (
        <ArrowUp className="size-3" aria-hidden />
      ) : (
        <ArrowDown className="size-3" aria-hidden />
      )
    ) : null;

  const ariaSort = (field: SortField) =>
    sort === field ? (dir === "asc" ? ("ascending" as const) : ("descending" as const)) : ("none" as const);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">
          Every order across your storefront and manual channels.
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> New order
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, customer, product…"
              className="pl-9"
              aria-label="Search orders"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
            className="w-40"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
          {status || debouncedQuery ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus("");
              }}
            >
              <X className="size-3.5" /> Clear
            </Button>
          ) : null}
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-brand/25 bg-brand-soft/60 px-5 py-2.5">
            <span className="text-[12.5px] font-medium text-foreground">
              {selected.size} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu
                trigger={
                  <Button variant="secondary" size="sm" disabled={bulkBusy}>
                    Set status <ChevronDown className="size-3.5" />
                  </Button>
                }
                items={STATUSES.map((s) => ({
                  label: statusLabel(s),
                  onSelect: () => bulkStatus(s),
                }))}
              />
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
                Clear selection
              </Button>
            </div>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="py-16 text-center">
            <p className="text-[13.5px] text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart />}
            title={debouncedQuery || status ? "No orders match your filters" : "No orders yet"}
            description={
              debouncedQuery || status
                ? "Try a different search term or clear the status filter."
                : "Create your first order to see it appear here."
            }
            action={
              debouncedQuery || status ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setStatus("");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" /> New order
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className={`overflow-x-auto transition-opacity ${refreshing ? "opacity-60" : ""}`}>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10 pr-0">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleAll}
                        aria-label="Select all orders on this page"
                        className="size-3.5 accent-[var(--brand)]"
                      />
                    </TH>
                    <TH aria-sort={ariaSort("number")}>
                      <button onClick={() => toggleSort("number")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Order {sortIcon("number")}
                      </button>
                    </TH>
                    <TH aria-sort={ariaSort("customer")}>
                      <button onClick={() => toggleSort("customer")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Customer {sortIcon("customer")}
                      </button>
                    </TH>
                    <TH className="hidden md:table-cell">Product</TH>
                    <TH className="hidden lg:table-cell">Channel</TH>
                    <TH className="hidden sm:table-cell" aria-sort={ariaSort("createdAt")}>
                      <button onClick={() => toggleSort("createdAt")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Date {sortIcon("createdAt")}
                      </button>
                    </TH>
                    <TH className="text-right" aria-sort={ariaSort("amount")}>
                      <button onClick={() => toggleSort("amount")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Amount {sortIcon("amount")}
                      </button>
                    </TH>
                    <TH>Status</TH>
                    <TH className="w-10" />
                  </TR>
                </THead>
                <TBody>
                  {orders.map((order) => (
                    <TR
                      key={order.id}
                      className={pendingId === order.id ? "opacity-60" : selected.has(order.id) ? "bg-brand-soft/40" : undefined}
                    >
                      <TD className="pr-0">
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleOne(order.id)}
                          aria-label={`Select order ${order.number}`}
                          className="size-3.5 accent-[var(--brand)]"
                        />
                      </TD>
                      <TD className="tabular font-medium text-foreground">{order.number}</TD>
                      <TD>
                        <span className="block max-w-40 truncate font-medium text-foreground">{order.customer}</span>
                        {order.email ? (
                          <span className="block max-w-44 truncate text-[12px] text-muted-foreground">{order.email}</span>
                        ) : null}
                      </TD>
                      <TD className="hidden max-w-48 truncate text-muted-foreground md:table-cell">{order.product}</TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-[12.5px] text-muted-foreground capitalize">
                          {order.channel.toLowerCase()}
                        </span>
                      </TD>
                      <TD className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                        {formatDateTime(order.createdAt)}
                      </TD>
                      <TD className="tabular text-right font-medium text-foreground">{formatCurrency(order.amount)}</TD>
                      <TD>
                        <Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"} dot>
                          {statusLabel(order.status)}
                        </Badge>
                      </TD>
                      <TD>
                        <DropdownMenu
                          trigger={
                            <button
                              className="focus-brand flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                              disabled={pendingId === order.id}
                              aria-label={`Change status for ${order.number}`}
                            >
                              <ChevronDown className="size-4" />
                            </button>
                          }
                          items={STATUSES.map((s) => ({
                            label: statusLabel(s),
                            checked: s === order.status,
                            disabled: s === order.status,
                            onSelect: () => changeStatus(order, s),
                          }))}
                        />
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

      <NewOrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(order) => {
          setDialogOpen(false);
          success(`Order ${order.number} created`);
          reload();
        }}
      />
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-40" />
      <div className="rounded-xl border border-border bg-card p-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mt-2 h-12 first:mt-0" />
        ))}
      </div>
    </div>
  );
}
