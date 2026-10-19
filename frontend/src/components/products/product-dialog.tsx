"use client";

import { useEffect, useState } from "react";
import type { Product, ProductStatus } from "@/lib/types";
import { api, ApiError, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

const STATUSES: ProductStatus[] = ["ACTIVE", "DRAFT", "ARCHIVED"];

const EMPTY = { name: "", sku: "", price: "", stock: "0", status: "DRAFT" as ProductStatus };

export function ProductDialog({
  open,
  onClose,
  product,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSaved: (product: Product) => void;
}) {
  const editing = product !== null;
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLimitHit(false);
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        price: String(product.price),
        stock: String(product.stock),
        status: product.status,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, product]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const submit = async () => {
    if (saving) return;
    setError(null);
    setLimitHit(false);

    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!form.name.trim()) {
      setError("Product name is required");
      return;
    }
    if (!editing && !/^[A-Za-z0-9-]+$/.test(form.sku.trim())) {
      setError("SKU may only contain letters, numbers and dashes");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Price must be a valid number");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError("Stock must be a non-negative whole number");
      return;
    }

    setSaving(true);
    try {
      const saved = editing
        ? await api.patch<Product>(`/products/${product.id}`, {
            name: form.name.trim(),
            price,
            stock,
            status: form.status,
          })
        : await api.post<Product>("/products", {
            name: form.name.trim(),
            sku: form.sku.trim(),
            price,
            stock,
            status: form.status,
          });
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PLAN_LIMIT_REACHED") {
        setLimitHit(true);
      }
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} size="md">
      <DialogHeader
        title={editing ? `Edit ${product.name}` : "New product"}
        description={editing ? "Update pricing, stock and availability." : "Add a product to your catalog."}
        onClose={close}
      />
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nimbus Pro"
              autoFocus
            />
          </Field>
          <Field label="SKU" hint={editing ? "SKU is immutable after creation." : "Letters, numbers and dashes."}>
            <Input
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              placeholder="NMB-PRO-01"
              disabled={editing}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Price (USD)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="99.00"
            />
          </Field>
          <Field label="Stock">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProductStatus }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2">
            <p className="text-[12.5px] text-danger">{error}</p>
            {limitHit ? (
              <a href="/settings?tab=billing" className="focus-brand mt-1 inline-block text-[12.5px] font-medium text-brand-text underline">
                Upgrade your plan in Settings → Billing
              </a>
            ) : null}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving}>
          {editing ? "Save changes" : "Create product"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
