-- =====================================================
-- SIMS AUTH SCHEMA
-- Creates the app-managed auth table and audit-log fields
-- Seeds the users that were previously hardcoded in the frontend
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. AUTH USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sims_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('master_admin', 'admin', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sims_users_email ON public.sims_users(email);
CREATE INDEX IF NOT EXISTS idx_sims_users_role ON public.sims_users(role);

ALTER TABLE public.sims_users DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. AUDIT LOG UPDATES FOR APP AUTH
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    table_name TEXT
);

ALTER TABLE public.audit_log
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.audit_log
    DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;

ALTER TABLE public.audit_log
    ADD COLUMN IF NOT EXISTS table_name TEXT;

ALTER TABLE public.audit_log DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);

-- =====================================================
-- 3. UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sims_users_updated_at ON public.sims_users;

CREATE TRIGGER update_sims_users_updated_at
    BEFORE UPDATE ON public.sims_users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4. PERMISSIONS FOR CURRENT FRONTEND FLOW
-- =====================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sims_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sims_users TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO anon;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;

-- =====================================================
-- 5. SEED THE PREVIOUSLY HARDCODED USERS
-- Passwords preserved from the old frontend code
-- =====================================================
INSERT INTO public.sims_users (email, password_hash, role)
VALUES
    ('adhammorsy2311@gmail.com', encode(digest('admin123', 'sha256'), 'hex'), 'master_admin'),
    ('adham.ahmed@hanwhaegypt.com', encode(digest('admin123', 'sha256'), 'hex'), 'admin'),
    ('mohamed_aref@hanwhaegypt.com', encode(digest('bigboss1977', 'sha256'), 'hex'), 'admin'),
    ('test@gmail.com', encode(digest('1234', 'sha256'), 'hex'), 'viewer'),
    ('extziahm@scangl.com', encode(digest('Ziad#99', 'sha256'), 'hex'), 'admin'),
    ('anash@scangl.com', encode(digest('Anash#02', 'sha256'), 'hex'), 'admin'),
    ('Ayman@f200.com', encode(digest('Ayman#1234', 'sha256'), 'hex'), 'admin'),
    ('kdh2873@hanwhaegypt.com', encode(digest('hyungkim2026', 'sha256'), 'hex'), 'viewer')
ON CONFLICT (email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    updated_at = NOW();

-- =====================================================
-- DONE
-- Login now reads from public.sims_users
-- =====================================================
