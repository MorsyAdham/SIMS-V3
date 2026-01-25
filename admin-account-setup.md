# 🔐 Admin Account Setup Guide

## Quick Setup for Your Admin Accounts

### Step 1: Run the Schema Update

1. Go to your Supabase project
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the **entire** `updated-schema.sql` content
5. Click **Run** (or press F5)
6. Wait for completion (should see "Success. No rows returned")

### Step 2: Create Your Admin Accounts

You have two options:

#### Option A: Via Supabase Dashboard (Recommended)

1. Go to **Authentication** → **Users**
2. Click **Add User** → **Create new user**
3. Create both accounts:
   - Email: `adhammorsy2311@gmail.com`
   - Password: (choose a strong password)
   - Auto Confirm User: ✅ **Yes**
   
4. Repeat for second account:
   - Email: `adham.ahmed@hanwhaegypt.com`
   - Password: (choose a strong password)
   - Auto Confirm User: ✅ **Yes**

#### Option B: Via Your Application

1. Go to your login page
2. Click "Request Access"
3. Sign up with `adhammorsy2311@gmail.com`
4. Sign up with `adham.ahmed@hanwhaegypt.com`
5. Confirm emails if required

### Step 3: Set Up Admin Permissions

1. Go back to **SQL Editor** in Supabase
2. Run these two commands **one at a time**:

```sql
SELECT setup_admin_user('adhammorsy2311@gmail.com');
```

You should see: ✅ "Admin user adhammorsy2311@gmail.com set up successfully"

```sql
SELECT setup_admin_user('adham.ahmed@hanwhaegypt.com');
```

You should see: ✅ "Admin user adham.ahmed@hanwhaegypt.com set up successfully"

### Step 4: Verify Admin Access

1. **Log out** if currently logged in
2. **Log in** with `adhammorsy2311@gmail.com`
3. You should see:
   - Your email in the top right
   - "ADMIN" badge next to your email
   - "Bulk Actions" section visible
   - "Upload File" button visible
   - "Audit Log" button visible
4. **Log out** and test with the second admin account

---

## 🔍 Verification Checklist

Run this query to verify your admin accounts:

```sql
SELECT 
    ur.email,
    ur.role,
    ur.approved,
    ur.created_at,
    au.email_confirmed_at
FROM public.user_roles ur
LEFT JOIN auth.users au ON ur.user_id = au.id
WHERE ur.email IN ('adhammorsy2311@gmail.com', 'adham.ahmed@hanwhaegypt.com');
```

You should see:

| email | role | approved | created_at | email_confirmed_at |
|-------|------|----------|------------|-------------------|
| adhammorsy2311@gmail.com | admin | true | (timestamp) | (timestamp) |
| adham.ahmed@hanwhaegypt.com | admin | true | (timestamp) | (timestamp) |

---

## ❓ Troubleshooting

### Problem: "User not found in auth.users"

**Solution:**
- Make sure you created the account in Supabase Auth first
- Check spelling of email address
- Wait a few seconds and try again

### Problem: "Access Denied" when logging in

**Solution:**
1. Check if `approved = true`:
```sql
SELECT approved FROM public.user_roles 
WHERE email = 'adhammorsy2311@gmail.com';
```

2. If false, manually approve:
```sql
UPDATE public.user_roles
SET approved = true, updated_at = NOW()
WHERE email = 'adhammorsy2311@gmail.com';
```

### Problem: Can't see admin features

**Solution:**
1. Check role:
```sql
SELECT role FROM public.user_roles 
WHERE email = 'adhammorsy2311@gmail.com';
```

2. If not 'admin', manually set:
```sql
UPDATE public.user_roles
SET role = 'admin', approved = true, updated_at = NOW()
WHERE email = 'adhammorsy2311@gmail.com';
```

3. **Log out and log back in**

### Problem: RLS Policies blocking access

**Solution:**
1. Verify RLS is enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

2. If needed, temporarily disable RLS for testing (NOT recommended for production):
```sql
ALTER TABLE public.inspection_boxes DISABLE ROW LEVEL SECURITY;
-- Re-enable when done testing:
-- ALTER TABLE public.inspection_boxes ENABLE ROW LEVEL SECURITY;
```

---

## 👥 Managing Other Users

### Approve a Pending User

```sql
-- View pending users
SELECT email, created_at
FROM public.user_roles
WHERE approved = false
ORDER BY created_at DESC;

-- Approve a user
UPDATE public.user_roles
SET approved = true, updated_at = NOW()
WHERE email = 'newuser@example.com';
```

### Make Someone an Admin

```sql
UPDATE public.user_roles
SET role = 'admin', approved = true, updated_at = NOW()
WHERE email = 'user@example.com';
```

### Revoke Admin Access (Make Viewer)

```sql
UPDATE public.user_roles
SET role = 'viewer', updated_at = NOW()
WHERE email = 'user@example.com';
```

### Remove User Access

```sql
UPDATE public.user_roles
SET approved = false, updated_at = NOW()
WHERE email = 'user@example.com';
```

---

## 🎯 What Admins Can Do

✅ View all inspection data  
✅ Edit any field in the data table  
✅ Upload new Excel files  
✅ Apply bulk updates to filtered data  
✅ Approve/reject new user signups  
✅ View complete audit log  
✅ Export data to Excel  
✅ Change user roles  

## 🎯 What Viewers Can Do

✅ View inspection data (read-only)  
✅ Filter and search data  
✅ View charts and statistics  
✅ Export data to Excel  
✅ View their own audit history  

❌ Cannot edit data  
❌ Cannot upload files  
❌ Cannot approve users  
❌ Cannot apply bulk updates  

---

## 🔒 Security Notes

1. **Never share your admin credentials**
2. **Use strong passwords** (minimum 12 characters)
3. **Enable 2FA** in Supabase if available
4. **Regularly review** the audit log
5. **Monitor** new user signups
6. **Review** user permissions quarterly

---

## 📞 Next Steps

After setting up your admin accounts:

1. ✅ Test login with both admin emails
2. ✅ Verify you can see admin features
3. ✅ Upload your first data file
4. ✅ Test editing a record
5. ✅ Check the audit log
6. ✅ Create a viewer account to test restrictions
7. ✅ Document your admin procedures

---

## 🎉 You're Ready!

Your admin accounts are now set up and ready to manage the SIMS platform!