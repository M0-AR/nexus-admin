#!/bin/bash
# Creates the RLS-enforced runtime role. Runs once, on first DB init.
# The role is deliberately weak: LOGIN only, NOBYPASSRLS, NOCREATEDB,
# NOCREATEROLE, NOSUPERUSER. Table privileges are granted by the
# 0002_rls_tenant_isolation migration (after tables exist).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
      CREATE ROLE app_user LOGIN PASSWORD '${APP_DB_PASSWORD:-nexus_dev_app_password}';
    END IF;
  END
  \$\$;
  ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user;
EOSQL

echo "[initdb] app_user role ready (NOBYPASSRLS)"
