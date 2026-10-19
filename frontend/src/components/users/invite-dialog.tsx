"use client";

import { useEffect, useState } from "react";
import type { InviteResponse, MembershipRole } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

const BASE_ROLES: MembershipRole[] = ["ADMIN", "MANAGER", "MEMBER"];

const EMPTY = { email: "", name: "", role: "MEMBER" as MembershipRole };

export function InviteMemberDialog({
  open,
  onClose,
  onInvited,
  actorRole,
  seatsLeft,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (result: InviteResponse) => void;
  actorRole: MembershipRole;
  seatsLeft: number;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
    }
  }, [open]);

  const roles: MembershipRole[] = actorRole === "OWNER" ? ["OWNER", ...BASE_ROLES] : BASE_ROLES;

  const close = () => {
    if (saving) return;
    onClose();
  };

  const submit = async () => {
    if (saving) return;
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Enter a valid email address");
      return;
    }

    setSaving(true);
    try {
      const result = await api.post<InviteResponse>("/members/invite", {
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        role: form.role,
      });
      setForm(EMPTY);
      onInvited(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} size="sm">
      <DialogHeader
        title="Invite a teammate"
        description={
          seatsLeft > 0
            ? `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left on your plan.`
            : "You have reached your plan's seat limit."
        }
        onClose={close}
      />
      <DialogBody className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="teammate@company.com"
            autoFocus
          />
        </Field>
        <Field label="Name" hint="Optional — defaults to the part before @.">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Alex Rivera"
          />
        </Field>
        <Field label="Role">
          <Select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as MembershipRole }))}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving} disabled={seatsLeft <= 0}>
          Send invite
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
