"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check, MoreHorizontal, UserPlus, Users } from "lucide-react";
import type { InviteResponse, Member, MembersResponse, MembershipRole } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { Badge, ROLE_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty";
import { DropdownMenu } from "@/components/ui/dropdown";
import { ConfirmDialog, Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Meter } from "@/components/ui/meter";
import { Table, TBody, TH, THead, TR, TD } from "@/components/ui/table";
import { InviteMemberDialog } from "@/components/users/invite-dialog";

const ALL_ROLES: MembershipRole[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER"];

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default function UsersPage() {
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <UsersView />
    </Suspense>
  );
}

function UsersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, user } = useAuth();
  const { success, error: errorToast } = useToast();

  const canManage = role === "OWNER" || role === "ADMIN";

  const { data, loading, error, reload } = useApi<MembersResponse>("/members");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (searchParams.get("invite") === "1" && canManage) {
      setInviteOpen(true);
      router.replace("/users");
    }
  }, [searchParams, router, canManage]);

  const members = data?.items ?? [];
  const seats = data?.seats;
  const seatsLeft = seats ? Math.max(0, seats.limit - seats.used) : 0;

  const changeRole = async (member: Member, next: MembershipRole) => {
    if (member.role === next) return;
    setBusyId(member.id);
    try {
      await api.patch(`/members/${member.id}`, { role: next });
      success(`${member.name} is now ${roleLabel(next)}`);
      reload();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async () => {
    if (!removing) return;
    const target = removing;
    setBusyId(target.id);
    try {
      await api.delete(`/members/${target.id}`);
      success(`${target.name} removed from the workspace`);
      setRemoving(null);
      reload();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const onInvited = (result: InviteResponse) => {
    setInviteOpen(false);
    reload();
    if (result.tempPassword) {
      setCredentials({ email: result.member.email, password: result.tempPassword });
    } else {
      success(`${result.member.name} added to the workspace`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">Manage members, roles and access to this workspace.</p>
        <div className="flex items-center gap-4">
          {seats ? (
            <Meter
              value={seats.used}
              max={seats.limit}
              label="Seats on plan"
              suffix={`${seats.used}/${seats.limit}`}
              className="w-40"
            />
          ) : null}
          {canManage ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invite
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        {loading && !data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
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
        ) : members.length === 0 ? (
          <EmptyState icon={<Users />} title="No members yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Joined</TH>
                {canManage ? <TH className="w-10" /> : null}
              </TR>
            </THead>
            <TBody>
              {members.map((member) => {
                const isSelf = member.userId === user?.id;
                const lockedByHierarchy = role === "ADMIN" && member.role === "OWNER";
                const editable = canManage && !isSelf && !lockedByHierarchy;
                const roles = role === "OWNER" ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "OWNER");

                return (
                  <TR key={member.id} className={busyId === member.id ? "opacity-60" : undefined}>
                    <TD>
                      <span className="flex items-center gap-3">
                        <Avatar name={member.name} color={member.avatarColor} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {member.name}
                            {isSelf ? <span className="ml-1.5 text-[11.5px] font-normal text-muted-foreground">(you)</span> : null}
                          </span>
                          <span className="block max-w-52 truncate text-[12px] text-muted-foreground">{member.email}</span>
                        </span>
                      </span>
                    </TD>
                    <TD>
                      {editable ? (
                        <DropdownMenu
                          trigger={
                            <button className="focus-brand inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium transition-colors hover:bg-muted">
                              <Badge tone={ROLE_TONE[member.role] ?? "neutral"}>{roleLabel(member.role)}</Badge>
                            </button>
                          }
                          items={roles.map((r) => ({
                            label: roleLabel(r),
                            checked: r === member.role,
                            disabled: r === member.role,
                            onSelect: () => changeRole(member, r),
                          }))}
                        />
                      ) : (
                        <Badge tone={ROLE_TONE[member.role] ?? "neutral"}>{roleLabel(member.role)}</Badge>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={member.status === "ACTIVE" ? "success" : "warning"} dot>
                        {member.status === "ACTIVE" ? "Active" : "Suspended"}
                      </Badge>
                    </TD>
                    <TD className="hidden text-muted-foreground md:table-cell">{formatDate(member.joinedAt)}</TD>
                    {canManage ? (
                      <TD>
                        {editable ? (
                          <DropdownMenu
                            trigger={
                              <button
                                className="focus-brand flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                aria-label={`Actions for ${member.name}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </button>
                            }
                            items={[{ label: "Remove from workspace", danger: true, onSelect: () => setRemoving(member) }]}
                          />
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={onInvited}
        actorRole={role ?? "MEMBER"}
        seatsLeft={seatsLeft}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={removeMember}
        title={`Remove ${removing?.name ?? "member"}?`}
        description="They will lose access immediately and be signed out on every device. Their account stays intact and can be re-invited later."
        confirmLabel="Remove"
        tone="danger"
        loading={busyId !== null}
      />

      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}

function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: { email: string; password: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`Email: ${credentials.email}\nTemporary password: ${credentials.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Dialog open={credentials !== null} onClose={onClose} size="sm">
      <DialogHeader
        title="Member added"
        description="Share these one-time credentials securely — the password is shown only once."
        onClose={onClose}
      />
      <DialogBody className="space-y-3">
        <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-3">
          <p className="text-[12px] font-medium text-muted-foreground">Email</p>
          <p className="mt-0.5 text-[13.5px] font-medium text-foreground">{credentials?.email}</p>
          <p className="mt-3 text-[12px] font-medium text-muted-foreground">Temporary password</p>
          <p className="tabular mt-0.5 font-mono text-[13.5px] font-medium text-foreground">{credentials?.password}</p>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          They should sign in and change this password from Settings → Security.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
        <Button onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy credentials"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-36" />
      <div className="rounded-xl border border-border bg-card p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mt-2 h-12 first:mt-0" />
        ))}
      </div>
    </div>
  );
}
