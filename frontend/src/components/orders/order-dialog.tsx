"use client";

import { useState } from "react";
import type { Order, OrderChannel, OrderStatus } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

const CHANNELS: OrderChannel[] = ["DIRECT", "ORGANIC", "REFERRAL", "SOCIAL", "PARTNER", "EMAIL"];
const STATUSES: OrderStatus[] = ["PENDING", "PAID", "REFUNDED", "CANCELLED", "FAILED"];

const EMPTY = {
  customer: "",
  email: "",
  product: "",
  channel: "DIRECT" as OrderChannel,
  amount: "",
  status: "PENDING" as OrderStatus,
};

export function NewOrderDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (order: Order) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (saving) return;
    setForm(EMPTY);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (saving) return;
    setError(null);

    const amount = Number(form.amount);
    if (!form.customer.trim()) {
      setError("Customer name is required");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Enter a valid email address, or leave it blank");
      return;
    }
    if (!form.product.trim()) {
      setError("Product is required");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be a positive number");
      return;
    }

    setSaving(true);
    try {
      const order = await api.post<Order>("/orders", {
        customer: form.customer.trim(),
        email: form.email.trim() || undefined,
        product: form.product.trim(),
        channel: form.channel,
        amount,
        status: form.status,
      });
      setForm(EMPTY);
      onCreated(order);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} size="md">
      <DialogHeader title="New order" description="Record an order placed outside the storefront." onClose={close} />
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer">
            <Input
              value={form.customer}
              onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))}
              placeholder="Jordan Blake"
              autoFocus
            />
          </Field>
          <Field label="Email" hint="Optional — used for receipts and customer stats.">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jordan@example.com"
            />
          </Field>
        </div>
        <Field label="Product">
          <Input
            value={form.product}
            onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
            placeholder="Nimbus Pro"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Amount (USD)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="249.00"
            />
          </Field>
          <Field label="Channel">
            <Select
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as OrderChannel }))}
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel.charAt(0) + channel.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as OrderStatus }))}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving}>
          Create order
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
