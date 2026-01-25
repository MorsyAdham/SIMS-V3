-- =====================================================
-- SIMS - UPDATED DATABASE SCHEMA
-- Works with existing tables
-- =====================================================

-- =====================================================
-- 1. UPDATE EXISTING user_roles TABLE
-- =====================================================
-- Add missing columns to user_roles
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add unique constraint on email
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_roles_email_key'
    ) THEN
        ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_email_key UNIQUE(email);
    END IF;
END $$;

-- Create index on email
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON public.user_roles(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_approved ON public.user_roles(approved);

-- =====================================================
-- 2. CREATE AUDIT LOG TABLE (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);

-- =====================================================
-- 3. UPDATE inspection_boxes TABLE
-- =====================================================
-- Add unique constraint to prevent duplicates
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'inspection_boxes_boxnum_containernum_key'
    ) THEN
        ALTER TABLE public.inspection_boxes 
        ADD CONSTRAINT inspection_boxes_boxnum_containernum_key 
        UNIQUE("BoxNum", "ContainerNum");
    END IF;
END $$;

-- Add created_at if missing
ALTER TABLE public.inspection_boxes 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Update updated_at to use TIMESTAMPTZ
ALTER TABLE public.inspection_boxes 
ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::TIMESTAMPTZ;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_inspection_boxes_container ON public.inspection_boxes("ContainerNum");
CREATE INDEX IF NOT EXISTS idx_inspection_boxes_shipment ON public.inspection_boxes(shipment);
CREATE INDEX IF NOT EXISTS idx_inspection_boxes_factory ON public.inspection_boxes("Factory");
CREATE INDEX IF NOT EXISTS idx_inspection_boxes_remarks ON public.inspection_boxes("REMARKS");
CREATE INDEX IF NOT EXISTS idx_inspection_boxes_completion_date ON public.inspection_boxes("CompletionDate");

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow signup insertions" ON public.user_roles;
DROP POLICY IF EXISTS "Approved users can view inspection data" ON public.inspection_boxes;
DROP POLICY IF EXISTS "Admins can insert inspection data" ON public.inspection_boxes;
DROP POLICY IF EXISTS "Admins can update inspection data" ON public.inspection_boxes;
DROP POLICY IF EXISTS "Admins can delete inspection data" ON public.inspection_boxes;
DROP POLICY IF EXISTS "Approved users can create audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_log;

-- =====================================================
-- USER_ROLES POLICIES
-- =====================================================

-- Users can view their own role
CREATE POLICY "Users can view own role"
    ON public.user_roles FOR SELECT
    USING (user_id = auth.uid());

-- Admins can view all roles
CREATE POLICY "Admins can view all user roles"
    ON public.user_roles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND approved = true
        )
    );

-- Allow new signups (unapproved)
CREATE POLICY "Allow signup insertions"
    ON public.user_roles FOR INSERT
    WITH CHECK (true);

-- Only admins can update roles
CREATE POLICY "Admins can update user roles"
    ON public.user_roles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND approved = true
        )
    );

-- =====================================================
-- INSPECTION_BOXES POLICIES
-- =====================================================

-- Approved users can view data
CREATE POLICY "Approved users can view inspection data"
    ON public.inspection_boxes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND approved = true
        )
    );

-- Admins can insert data
CREATE POLICY "Admins can insert inspection data"
    ON public.inspection_boxes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND approved = true
        )
    );

-- Admins can update data
CREATE POLICY "Admins can update inspection data"
    ON public.inspection_boxes FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND approved = true
        )
    );

-- Admins can delete data
CREATE POLICY "Admins can delete inspection data"
    ON public.inspection_boxes FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND approved = true
        )
    );

-- =====================================================
-- AUDIT_LOG POLICIES
-- =====================================================

-- Approved users can insert audit logs
CREATE POLICY "Approved users can create audit logs"
    ON public.audit_log FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND approved = true
        )
    );

-- Users can view their own logs
CREATE POLICY "Users can view own audit logs"
    ON public.audit_log FOR SELECT
    USING (user_id = auth.uid());

-- Admins can view all logs
CREATE POLICY "Admins can view all audit logs"
    ON public.audit_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND approved = true
        )
    );

-- =====================================================
-- EDIT_HISTORY POLICIES
-- =====================================================

-- Approved users can view edit history
CREATE POLICY "Approved users can view edit history"
    ON public.edit_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND approved = true
        )
    );

-- System can insert edit history
CREATE POLICY "System can insert edit history"
    ON public.edit_history FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND approved = true
        )
    );

-- =====================================================
-- 5. TRIGGERS FOR AUTO-UPDATING TIMESTAMPS
-- =====================================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;
DROP TRIGGER IF EXISTS update_inspection_boxes_updated_at ON public.inspection_boxes;

-- Create triggers
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inspection_boxes_updated_at
    BEFORE UPDATE ON public.inspection_boxes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. SET UP ADMIN ACCOUNTS
-- =====================================================
-- This will create admin entries for your specified emails
-- Run this AFTER you create these accounts in Supabase Auth

-- First, let's create a helper function to set up admins
CREATE OR REPLACE FUNCTION setup_admin_user(admin_email TEXT)
RETURNS void AS $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Get user_id from auth.users
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE email = admin_email;
    
    IF admin_user_id IS NOT NULL THEN
        -- Insert or update user_roles
        INSERT INTO public.user_roles (user_id, email, role, approved, created_at, updated_at)
        VALUES (admin_user_id, admin_email, 'admin', true, NOW(), NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            role = 'admin',
            approved = true,
            email = admin_email,
            updated_at = NOW();
            
        RAISE NOTICE 'Admin user % set up successfully', admin_email;
    ELSE
        RAISE NOTICE 'User with email % not found in auth.users. Please create account first.', admin_email;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. SETUP YOUR ADMIN ACCOUNTS
-- =====================================================
-- INSTRUCTIONS:
-- 1. First, create these accounts via the Supabase Auth dashboard or signup page
-- 2. Then run these commands to make them admins:

-- SELECT setup_admin_user('adhammorsy2311@gmail.com');
-- SELECT setup_admin_user('adham.ahmed@hanwhaegypt.com');

-- =====================================================
-- 8. HELPFUL ADMIN QUERIES
-- =====================================================

-- View all users and their roles
-- SELECT 
--     ur.user_id,
--     ur.email,
--     ur.role,
--     ur.approved,
--     ur.created_at,
--     au.email as auth_email,
--     au.created_at as auth_created_at
-- FROM public.user_roles ur
-- LEFT JOIN auth.users au ON ur.user_id = au.id
-- ORDER BY ur.created_at DESC;

-- View pending approvals
-- SELECT 
--     ur.user_id,
--     ur.email,
--     ur.role,
--     ur.created_at,
--     au.email as auth_email
-- FROM public.user_roles ur
-- LEFT JOIN auth.users au ON ur.user_id = au.id
-- WHERE ur.approved = false
-- ORDER BY ur.created_at DESC;

-- Approve a user
-- UPDATE public.user_roles
-- SET approved = true, updated_at = NOW()
-- WHERE email = 'user@example.com';

-- Make user an admin
-- UPDATE public.user_roles
-- SET role = 'admin', approved = true, updated_at = NOW()
-- WHERE email = 'user@example.com';

-- View recent audit logs
-- SELECT 
--     al.user_email,
--     al.action,
--     al.details,
--     al.timestamp
-- FROM public.audit_log al
-- ORDER BY al.timestamp DESC
-- LIMIT 50;

-- View edit history
-- SELECT 
--     eh.table_name,
--     eh.row_id,
--     eh.column_name,
--     eh.old_value,
--     eh.new_value,
--     eh.edited_by_email,
--     eh.edited_at
-- FROM public.edit_history eh
-- ORDER BY eh.edited_at DESC
-- LIMIT 50;

-- Get inspection statistics by factory
-- SELECT 
--     "Factory",
--     COUNT(*) as total_boxes,
--     COUNT(CASE WHEN "REMARKS" ILIKE '%done%' THEN 1 END) as completed,
--     COUNT(CASE WHEN "REMARKS" ILIKE '%progress%' THEN 1 END) as in_progress,
--     COUNT(CASE WHEN "REMARKS" = '' OR "REMARKS" IS NULL THEN 1 END) as not_started,
--     ROUND(100.0 * COUNT(CASE WHEN "REMARKS" ILIKE '%done%' THEN 1 END) / COUNT(*), 2) as completion_percentage
-- FROM public.inspection_boxes
-- GROUP BY "Factory"
-- ORDER BY "Factory";

-- =====================================================
-- 9. GRANT PERMISSIONS
-- =====================================================

-- Grant authenticated users access to tables
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT ON public.user_roles TO authenticated;

GRANT SELECT ON public.inspection_boxes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.inspection_boxes TO authenticated;

GRANT SELECT, INSERT ON public.audit_log TO authenticated;

GRANT SELECT, INSERT ON public.edit_history TO authenticated;

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- Next steps:
-- 1. Create accounts for adhammorsy2311@gmail.com and adham.ahmed@hanwhaegypt.com
-- 2. Run: SELECT setup_admin_user('adhammorsy2311@gmail.com');
-- 3. Run: SELECT setup_admin_user('adham.ahmed@hanwhaegypt.com');
-- 4. Test login with both accounts
-- 5. Verify admin permissions work
-- =====================================================