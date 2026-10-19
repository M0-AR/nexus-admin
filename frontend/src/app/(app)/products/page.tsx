"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArrowDown, ArrowUp, MoreHorizontal, Package, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import type { Paginated, Product, ProductStatus } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useDebounce } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useToast } from "@/components/ui/toast";
import { Badge, PRODUCT_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty";
import { DropdownMenu } from "@/components/ui/dropdown";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Meter } from "@/components/ui/meter";
import { Table, TBody, TH, THead, TR, TD } from "@/components/ui/table";
import { ProductDialog } from "@/components/products/product-dialog";

const PAGE_SIZE = 10;
type SortField = "name" | "price" | "stock" | "updatedAt";

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <ProductsView />
    </Suspense>
  );
}

function ProductsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useAuth();
  const { billing } = useWorkspace();
  const { success, error: errorToast } = useToast();

  const canManage = role === "OWNER" || role === "ADMIN" || role === "MANAGER";

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [sort, setSort] = useState<SortField>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    params.set("sort", sort);
    params.set("dir", dir);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (status) params.set("status", status);
    return `/products?${params.toString()}`;
  }, [page, debouncedQuery, status, sort, dir]);

  const { data, loading, refreshing, error, reload, setData } = useApi<Paginated<Product>>(path);

  useEffect(() => {
    if (searchParams.get("new") === "1" && canManage) {
      setEditing(null);
      setDialogOpen(true);
      router.replace("/products");
    }
  }, [searchParams, router, canManage]);

  useEffect(() => setPage(1), [debouncedQuery, status]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setDialogOpen(true);
  };

  const archive = async () => {
    if (!archiving) return;
    const target = archiving;
    setBusyId(target.id);
    try {
      const updated = await api.delete<Product>(`/products/${target.id}`);
      setData((prev) => (prev ? { ...prev, items: prev.items.map((p) => (p.id === target.id ? updated : p)) } : prev));
      success(`${target.name} archived`);
      setArchiving(null);
      reload();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (product: Product) => {
    setBusyId(product.id);
    try {
      const updated = await api.patch<Product>(`/products/${product.id}`, { status: "ACTIVE" });
      setData((prev) => (prev ? { ...prev, items: prev.items.map((p) => (p.id === product.id ? updated : p)) } : prev));
      success(`${product.name} restored`);
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const products = data?.items ?? [];
  const isFiltered = Boolean(debouncedQuery.trim() || status);
  const productLimit = billing?.plan.limits.products;
  const productsUsed = !isFiltered && status !== "ARCHIVED" ? data?.total : undefined;

  const toggleSort = (field: SortField) => {
    if (sort === field) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setDir("asc");
    }
    setPage(1);
  };

  const sortIcon = (field: SortField) =>
    sort === field ? (
      dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />
    ) : null;

  const ariaSort = (field: SortField) =>
    sort === field ? (dir === "asc" ? ("ascending" as const) : ("descending" as const)) : ("none" as const);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">Manage your catalog, pricing and inventory.</p>
        <div className="flex items-center gap-4">
          {productLimit !== undefined && productsUsed !== undefined ? (
            <Meter
              value={productsUsed}
              max={productLimit}
              label="Products on plan"
              suffix={`${productsUsed}/${productLimit}`}
              className="w-40"
            />
          ) : null}
          {canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New product
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or SKU…"
              className="pl-9"
              aria-label="Search products"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProductStatus | "")}
            className="w-44"
            aria-label="Filter by status"
          >
            <option value="">Active & drafts</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          {isFiltered ? (
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
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title={isFiltered ? "No products match your filters" : "No products yet"}
            description={
              isFiltered
                ? "Try a different search term or clear the status filter."
                : "Add your first product to start selling."
            }
            action={
              isFiltered ? (
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
              ) : canManage ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" /> New product
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
                    <TH aria-sort={ariaSort("name")}>
                      <button onClick={() => toggleSort("name")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Product {sortIcon("name")}
                      </button>
                    </TH>
                    <TH>SKU</TH>
                    <TH className="text-right" aria-sort={ariaSort("price")}>
                      <button onClick={() => toggleSort("price")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Price {sortIcon("price")}
                      </button>
                    </TH>
                    <TH className="text-right" aria-sort={ariaSort("stock")}>
                      <button onClick={() => toggleSort("stock")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Stock {sortIcon("stock")}
                      </button>
                    </TH>
                    <TH>Status</TH>
                    <TH className="hidden md:table-cell" aria-sort={ariaSort("updatedAt")}>
                      <button onClick={() => toggleSort("updatedAt")} className="focus-brand inline-flex items-center gap-1 uppercase">
                        Updated {sortIcon("updatedAt")}
                      </button>
                    </TH>
                    {canManage ? <TH className="w-10" /> : null}
                  </TR>
                </THead>
                <TBody>
                  {products.map((product) => (
                    <TR key={product.id} className={busyId === product.id ? "opacity-60" : undefined}>
                      <TD className="max-w-56 truncate font-medium text-foreground">{product.name}</TD>
                      <TD className="tabular font-mono text-[12.5px] text-muted-foreground">{product.sku}</TD>
                      <TD className="tabular text-right font-medium text-foreground">{formatCurrency(product.price)}</TD>
                      <TD className="tabular text-right">
                        <span className={product.stock === 0 ? "font-medium text-warning" : "text-muted-foreground"}>
                          {product.stock}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={PRODUCT_STATUS_TONE[product.status] ?? "neutral"} dot>
                          {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                        </Badge>
                      </TD>
                      <TD className="hidden text-muted-foreground md:table-cell">{formatDate(product.updatedAt)}</TD>
                      {canManage ? (
                        <TD>
                          <DropdownMenu
                            trigger={
                              <button
                                className="focus-brand flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                aria-label={`Actions for ${product.name}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </button>
                            }
                            items={[
                              { label: "Edit", icon: <Pencil />, onSelect: () => openEdit(product) },
                              product.status === "ARCHIVED"
                                ? { label: "Restore", icon: <RotateCcw />, onSelect: () => restore(product) }
                                : { label: "Archive", icon: <Archive />, danger: true, onSelect: () => setArchiving(product) },
                            ]}
                          />
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <Pagination page={data!.page} pages={data!.pages} total={data!.total} onPage={setPage} />
          </>
        )}
      </div>

      <ProductDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        product={editing}
        onSaved={(saved) => {
          setDialogOpen(false);
          success(editing ? `${saved.name} updated` : `${saved.name} created`);
          reload();
        }}
      />

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        onConfirm={archive}
        title={`Archive ${archiving?.name ?? "product"}?`}
        description="Archived products are hidden from the catalog and stop counting toward your plan limit. You can restore them anytime."
        confirmLabel="Archive"
        tone="danger"
        loading={busyId !== null}
      />
    </div>
  );
}

function ProductsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-44" />
      <div className="rounded-xl border border-border bg-card p-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mt-2 h-12 first:mt-0" />
        ))}
      </div>
    </div>
  );
}
