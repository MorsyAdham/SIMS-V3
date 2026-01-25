# 🔧 Admin Quick Reference Card

## Essential SQL Commands

### 👥 User Management

**View all users:**
```sql
SELECT 
    ur.email,
    ur.role,
    ur.approved,
    ur.created_at,
    au.last_sign_in_at
FROM public.user_roles ur
LEFT JOIN auth.users au ON ur.user_id = au.id
ORDER BY ur.created_at DESC;
```

**View pending approvals:**
```sql
SELECT email, created_at
FROM public.user_roles
WHERE approved = false
ORDER BY created_at DESC;
```

**Approve a user:**
```sql
UPDATE public.user_roles
SET approved = true, updated_at = NOW()
WHERE email = 'user@example.com';
```

**Reject/Block a user:**
```sql
UPDATE public.user_roles
SET approved = false, updated_at = NOW()
WHERE email = 'user@example.com';
```

**Make user an admin:**
```sql
UPDATE public.user_roles
SET role = 'admin', approved = true, updated_at = NOW()
WHERE email = 'user@example.com';
```

**Demote admin to viewer:**
```sql
UPDATE public.user_roles
SET role = 'viewer', updated_at = NOW()
WHERE email = 'user@example.com';
```

**Delete user (careful!):**
```sql
DELETE FROM public.user_roles
WHERE email = 'user@example.com';
-- Then delete from auth.users in Supabase dashboard
```

---

### 📊 Data Management

**Count total boxes:**
```sql
SELECT COUNT(*) as total_boxes
FROM public.inspection_boxes;
```

**View summary by factory:**
```sql
SELECT 
    "Factory",
    COUNT(*) as total,
    COUNT(CASE WHEN "REMARKS" ILIKE '%done%' THEN 1 END) as completed,
    COUNT(CASE WHEN "REMARKS" ILIKE '%progress%' THEN 1 END) as in_progress,
    ROUND(100.0 * COUNT(CASE WHEN "REMARKS" ILIKE '%done%' THEN 1 END) / COUNT(*), 1) as pct_complete
FROM public.inspection_boxes
GROUP BY "Factory"
ORDER BY "Factory";
```

**View summary by container:**
```sql
SELECT 
    "ContainerNum",
    COUNT(*) as total,
    COUNT(CASE WHEN "REMARKS" ILIKE '%done%' THEN 1 END) as completed,
    COUNT(CASE WHEN "REMARKS" = '' OR "REMARKS" IS NULL THEN 1 END) as not_started
FROM public.inspection_boxes
GROUP BY "ContainerNum"
ORDER BY "ContainerNum";
```

**Find duplicates:**
```sql
SELECT "BoxNum", "ContainerNum", COUNT(*)
FROM public.inspection_boxes
GROUP BY "BoxNum", "ContainerNum"
HAVING COUNT(*) > 1;
```

**Delete duplicates (keep first):**
```sql
DELETE FROM public.inspection_boxes a
USING public.inspection_boxes b
WHERE a.id > b.id
  AND a."BoxNum" = b."BoxNum"
  AND a."ContainerNum" = b."ContainerNum";
```

**Bulk update REMARKS:**
```sql
-- Mark all F200 boxes as Done
UPDATE public.inspection_boxes
SET "REMARKS" = 'Done',
    "CompletionDate" = CURRENT_DATE,
    updated_at = NOW()
WHERE "Factory" = 'F200'
  AND ("REMARKS" IS NULL OR "REMARKS" = '');
```

**Reset all completion dates:**
```sql
UPDATE public.inspection_boxes
SET "CompletionDate" = NULL,
    updated_at = NOW()
WHERE "CompletionDate" IS NOT NULL;
```

---

### 📋 Audit & History

**View recent audit logs:**
```sql
SELECT 
    user_email,
    action,
    details,
    timestamp
FROM public.audit_log
ORDER BY timestamp DESC
LIMIT 50;
```

**View today's activity:**
```sql
SELECT 
    user_email,
    action,
    COUNT(*) as count
FROM public.audit_log
WHERE timestamp >= CURRENT_DATE
GROUP BY user_email, action
ORDER BY count DESC;
```

**View specific user's activity:**
```sql
SELECT 
    action,
    details,
    timestamp
FROM public.audit_log
WHERE user_email = 'user@example.com'
ORDER BY timestamp DESC
LIMIT 20;
```

**View edit history:**
```sql
SELECT 
    eh.table_name,
    eh.column_name,
    eh.old_value,
    eh.new_value,
    eh.edited_by_email,
    eh.edited_at
FROM public.edit_history eh
ORDER BY eh.edited_at DESC
LIMIT 50;
```

**Find who edited a specific box:**
```sql
SELECT 
    column_name,
    old_value,
    new_value,
    edited_by_email,
    edited_at
FROM public.edit_history
WHERE table_name = 'inspection_boxes'
  AND row_id = (
      SELECT id FROM public.inspection_boxes 
      WHERE "BoxNum" = '29-10' AND "ContainerNum" = '1'
  )
ORDER BY edited_at DESC;
```

---

### 🔒 Security & Maintenance

**Check RLS status:**
```sql
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('inspection_boxes', 'user_roles', 'audit_log')
ORDER BY tablename;
```

**View active policies:**
```sql
SELECT 
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Backup data (run in Supabase SQL editor):**
```sql
-- This creates a backup you can download
COPY (
    SELECT * FROM public.inspection_boxes
) TO '/tmp/backup.csv' WITH CSV HEADER;
```

**Check database size:**
```sql
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 🚨 Emergency Commands

### Disable RLS (ONLY for emergency debugging)
```sql
-- Temporarily disable RLS (NOT recommended for production!)
ALTER TABLE public.inspection_boxes DISABLE ROW LEVEL SECURITY;

-- Re-enable when done:
ALTER TABLE public.inspection_boxes ENABLE ROW LEVEL SECURITY;
```

### Reset all passwords (in case of security breach)
```sql
-- Force all users to reset password
-- Run this in Supabase dashboard → Authentication → Users
-- Select all users → "Send password recovery"
```

### Clear all audit logs (careful!)
```sql
TRUNCATE public.audit_log;
```

---

## 📞 Support Contacts

**Primary Admin:** adhammorsy2311@gmail.com  
**Secondary Admin:** adham.ahmed@hanwhaegypt.com  
**Supabase Project:** biqwfqkuhebxcfucangt.supabase.co

---

## 🔑 Key Shortcuts

| Action | Command |
|--------|---------|
| Run SQL | `F5` or `Ctrl+Enter` |
| New Query | `Ctrl+N` |
| Format SQL | `Ctrl+Shift+F` |
| Comment | `Ctrl+/` |

---

## 📊 Daily Checklist

- [ ] Check for new user signups (pending approvals)
- [ ] Review audit log for unusual activity
- [ ] Verify no failed login attempts
- [ ] Check data integrity (no unexpected changes)

## 📅 Weekly Checklist

- [ ] Export database backup
- [ ] Review user permissions
- [ ] Check for duplicate entries
- [ ] Monitor system performance
- [ ] Review completed inspections

## 📆 Monthly Checklist

- [ ] Full database backup to external storage
- [ ] Security review (check RLS policies)
- [ ] Remove inactive users (if any)
- [ ] Performance optimization
- [ ] Update documentation (if needed)

---

## 💡 Pro Tips

1. **Always backup before bulk operations**
2. **Test queries on small dataset first** (use `LIMIT 10`)
3. **Use transactions for multiple updates**
   ```sql
   BEGIN;
   UPDATE ... ;
   UPDATE ... ;
   -- Review changes
   COMMIT; -- or ROLLBACK if something's wrong
   ```
4. **Monitor audit log after approving new users**
5. **Keep this reference card bookmarked!**

---

## 🔗 Quick Links

- [Supabase Dashboard](https://app.supabase.com)
- [SQL Editor](https://app.supabase.com/project/_/sql)
- [Auth Users](https://app.supabase.com/project/_/auth/users)
- [Database Tables](https://app.supabase.com/project/_/editor)
- [API Settings](https://app.supabase.com/project/_/settings/api)

---

## ⚠️ Remember

- **Never share service role key** (only use anon key in frontend)
- **Always test on sample data first**
- **Keep backups before major changes**
- **Document any manual SQL changes**
- **Review audit logs regularly**

---

Last Updated: January 2026  
Version: 1.0