-- Gerado por: npm --prefix server run db:roles -- --database ludraw --init-script > deploy/postgres/10-ludraw-roles.sql
-- Não edite à mão: o teste db-roles confere que este arquivo é igual ao que server/src/db/roles.ts monta.
-- LuDraw · papéis do banco (Chat 09 · R1). Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ludraw_owner') THEN CREATE ROLE "ludraw_owner" NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ludraw_migrator') THEN CREATE ROLE "ludraw_migrator" LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ludraw_app') THEN CREATE ROLE "ludraw_app" LOGIN; END IF;
END
$$;
ALTER ROLE "ludraw_owner" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE "ludraw_migrator" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE "ludraw_app" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT "ludraw_owner" TO "ludraw_migrator";
ALTER ROLE "ludraw_migrator" SET role = 'ludraw_owner';
ALTER ROLE "ludraw_migrator" SET statement_timeout = 0;
ALTER ROLE "ludraw_app" SET statement_timeout = 15000;
ALTER ROLE "ludraw_app" SET idle_in_transaction_session_timeout = 30000;
ALTER DATABASE "ludraw" OWNER TO "ludraw_owner";
REVOKE ALL ON DATABASE "ludraw" FROM PUBLIC;
GRANT CONNECT ON DATABASE "ludraw" TO "ludraw_migrator", "ludraw_app";

-- LuDraw · esquemas e permissões (Chat 09 · R1). Idempotente.
ALTER SCHEMA public OWNER TO "ludraw_owner";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "ludraw_app";
CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION "ludraw_owner";
ALTER SCHEMA drizzle OWNER TO "ludraw_owner";
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC;
GRANT USAGE ON SCHEMA drizzle TO "ludraw_app";
ALTER DEFAULT PRIVILEGES FOR ROLE "ludraw_owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "ludraw_app";
ALTER DEFAULT PRIVILEGES FOR ROLE "ludraw_owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "ludraw_app";
ALTER DEFAULT PRIVILEGES FOR ROLE "ludraw_owner" IN SCHEMA drizzle GRANT SELECT ON TABLES TO "ludraw_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "ludraw_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "ludraw_app";
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO "ludraw_app";
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA drizzle FROM "ludraw_app";
