-- ─────────────────────────────────────────────────────────────────────────────
-- Pattern #1: shared-schema multi-tenancy with FORCE row-level security.
--
-- Every tenant-scoped table carries tenant_id; policies compare it against
-- app.tenant_id, a transaction-local setting established by
-- TenantDbService.run() via SELECT set_config('app.tenant_id', $1, true).
--
-- FORCE ROW LEVEL SECURITY makes the policies apply even to the table owner,
-- so a migration or ad-hoc session that forgets set_config sees zero rows
-- rather than everything.
--
-- The runtime role (app_user) is created by docker/initdb/01-app-user.sh with
-- NOSUPERUSER NOBYPASSRLS and receives table privileges here. Control-plane
-- tables (tenants, users, memberships, refresh_tokens, subscriptions) are
-- intentionally NOT row-level-secured: they are platform-owned and are the
-- cross-tenant auth surface. They do receive plain (non-RLS) grants below.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Enable + force RLS on every tenant-scoped table.
DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders',
    'products',
    'notifications',
    'audit_logs',
    'usage_records',
    'integration_secrets',
    'feature_overrides',
    'tenant_keys'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$rls$;

-- 2) Runtime role privileges. app_user is created by the docker initdb script;
--    if it does not exist (unmanaged deployment), grants are skipped loudly.
DO $grants$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'role app_user not found — skipping runtime grants (create it and re-run GRANTs manually)';
    RETURN;
  END IF;

  GRANT USAGE ON SCHEMA public TO app_user;

  -- Tenant-scoped tables: DML only through RLS policies above.
  -- Control-plane tables: DML used by the app through Prisma.
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

  -- Future tables created by the migrating role inherit the same grants.
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user',
    current_user
  );
END
$grants$;
