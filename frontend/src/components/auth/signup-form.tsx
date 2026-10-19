"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";

const REGIONS = [
  { value: "us-east-1", label: "US East (Virginia)" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)" },
  { value: "ap-southeast-1", label: "AP Southeast (Singapore)" },
];

export function SignupForm() {
  const router = useRouter();
  const { signup, status } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
  }, [status, router]);

  const rules = useMemo(
    () => [
      { label: "10+ characters", ok: password.length >= 10 },
      { label: "Lowercase letter", ok: /[a-z]/.test(password) },
      { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
      { label: "Number", ok: /\d/.test(password) },
    ],
    [password],
  );
  const passwordValid = rules.every((r) => r.ok);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signup({ companyName, name, email, password, region });
      router.replace("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="animate-slide-up">
      <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Create your workspace</h1>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        14-day Pro trial on every new workspace. No credit card required.
      </p>

      <form className="mt-7 space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Input
              placeholder="Acme Corp"
              autoComplete="organization"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field label="Your name">
            <Input
              placeholder="Ada Lovelace"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Work email">
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {rules.map((rule) => (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 text-[12px] transition-colors ${
                rule.ok ? "text-success" : "text-muted-foreground"
              }`}
            >
              <Check className={`size-3.5 ${rule.ok ? "opacity-100" : "opacity-40"}`} />
              {rule.label}
            </li>
          ))}
        </ul>

        <Field label="Data region" hint="Where your tenant data is stored. Cannot be changed later.">
          <Select value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>

        {error ? (
          <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!passwordValid}>
          Create workspace
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="focus-brand font-medium text-brand-text hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
