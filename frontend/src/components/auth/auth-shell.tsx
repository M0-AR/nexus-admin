import { LogoWordmark } from "@/components/brand/logo";

/** Split-screen frame for /login and /signup: form left, showcase right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <LogoWordmark />
          <span className="hidden text-[12.5px] text-muted-foreground sm:block">
            SOC2-ready · GDPR-friendly
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="text-center text-[12px] text-muted-foreground">
          © {new Date().getFullYear()} Nexus Labs, Inc. — all rights reserved.
        </p>
      </div>

      <ShowcasePanel />
    </div>
  );
}

function ShowcasePanel() {
  return (
    <div className="relative hidden overflow-hidden border-l border-border lg:block">
      {/* Ambient brand wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 85% 0%, color-mix(in oklab, var(--brand) 24%, transparent) 0%, transparent 55%), radial-gradient(90% 80% at 10% 100%, color-mix(in oklab, var(--brand) 14%, transparent) 0%, transparent 50%)",
        }}
      />
      <div className="relative flex h-full flex-col justify-center gap-8 px-14 xl:px-20">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.18em] text-brand-text uppercase">One console, every tenant</p>
          <h2 className="mt-3 max-w-md text-[28px] leading-tight font-semibold tracking-tight text-foreground">
            Run your whole SaaS business from a single pane of glass.
          </h2>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Row-level tenant isolation, per-workspace branding, plan entitlements and audit trails — wired into
            every request by default.
          </p>
        </div>

        <MockDashboardCard />

        <ul className="grid max-w-md gap-2.5 text-[13px] text-muted-foreground">
          {[
            "Instant white-labeling — colors re-skin the app live",
            "Refresh-token rotation with family breach detection",
            "Usage metering and plan gates enforced at the API edge",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-brand-text" fill="currentColor" aria-hidden>
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm3.7 6.2-4.2 4.3a.9.9 0 0 1-1.3 0L4.3 8.6a.9.9 0 1 1 1.3-1.2l1.3 1.3 3.5-3.6a.9.9 0 0 1 1.3 1.1Z" />
              </svg>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Static decorative dashboard preview (no data, pure CSS/SVG). */
function MockDashboardCard() {
  return (
    <div className="card-sheen max-w-md rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-elevated)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-danger/70" />
          <span className="size-2 rounded-full bg-warning/70" />
          <span className="size-2 rounded-full bg-success/70" />
        </div>
        <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[10.5px] font-medium text-brand-text">LIVE</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {[
          { label: "Revenue", value: "$7.4k", delta: "+129%" },
          { label: "Orders", value: "48", delta: "+60%" },
          { label: "Conversion", value: "0.63%", delta: "+12%" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card-elevated px-2.5 py-2">
            <p className="text-[10.5px] text-muted-foreground">{stat.label}</p>
            <p className="tabular mt-0.5 text-[15px] font-semibold text-foreground">{stat.value}</p>
            <p className="text-[10.5px] font-medium text-success">{stat.delta}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 320 80" className="mt-3 w-full text-brand-text" aria-hidden>
        <defs>
          <linearGradient id="mock-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 62 C24 58 40 44 60 46 C82 48 96 30 118 34 C140 38 152 22 176 26 C200 30 212 14 236 18 C260 22 282 8 320 12 L320 80 L0 80 Z"
          fill="url(#mock-fill)"
        />
        <path
          d="M0 62 C24 58 40 44 60 46 C82 48 96 30 118 34 C140 38 152 22 176 26 C200 30 212 14 236 18 C260 22 282 8 320 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
