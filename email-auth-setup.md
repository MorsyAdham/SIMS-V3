# 🚀 SIMS Setup Guide - Simple Email Authentication

## ✅ What Changed:
- **No Supabase Auth** - Simple email-based login
- **User roles stored in localStorage** - Managed by master admin
- **Master admin** (`adhammorsy2311@gmail.com`) can add/remove users
- **Same admin/viewer permissions** as before

---

## 📋 Setup Steps (15 minutes total)

### Step 1: Update Database (5 min)

1. Go to Supabase → SQL Editor
2. Copy artifact: **"Updated Schema (Simplified - No PL/pgSQL)"**
3. Paste and click **Run**
4. Ignore warnings about "already exists"

**Note:** The audit_log table needs slight modification. Run this:

```sql
-- Modify audit_log to not require user_id from auth
ALTER TABLE public.audit_log 
ALTER COLUMN user_id DROP NOT NULL;

-- Or recreate the table
DROP TABLE IF EXISTS public.audit_log CASCADE;

CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_email ON public.audit_log(user_email);
CREATE INDEX idx_audit_log_timestamp ON public.audit_log(timestamp DESC);
```

### Step 2: Update Files (5 min)

Replace these files:

**1. login.html**
- Use artifact: **"Simple Login (Email-Based)"**

**2. assets/scripts/app.js**
- Use artifact: **"App.js (Simple Email Auth)"**

**3. index.html**
- Keep your existing index.html (no changes needed)

### Step 3: Test Login (5 min)

1. Open `login.html` in browser
2. Login with:
   - Email: `adhammorsy2311@gmail.com`
   - Password: `admin123`
3. Should successfully login as Admin
4. Try wrong password → Should show "Incorrect password"
5. Try unauthorized email → Should show "Email not authorized"

### Step 4: Add More Users (Master Admin Only)

1. Login as `adhammorsy2311@gmail.com`
2. Click **"👥 Manage Users"** button
3. Add email and select role (admin/viewer)
4. Click "Add User"

---

## 🔑 Default Users & Passwords

```javascript
Email: "adhammorsy2311@gmail.com"
Password: "admin123"
Role: admin (master, cannot be removed)

Email: "adham.ahmed@hanwhaegypt.com"
Password: "admin123"
Role: admin
```

**⚠️ Change these default passwords after first login!**

---

## 👥 User Management

### Adding Users (Master Admin Only)

1. Click "👥 Manage Users"
2. Enter email address
3. **Enter password** (minimum 4 characters)
4. Select role: **Admin** or **Viewer**
5. Click "Add User"

### Changing Passwords

1. Open "👥 Manage Users"
2. Find user in the list
3. Enter new password in the password field
4. Click "Change Password"
5. Password updated instantly

### Changing Roles

1. Open "👥 Manage Users"
2. Use dropdown next to user email
3. Select new role
4. Automatically saved

### Removing Users

1. Open "👥 Manage Users"
2. Click "Remove" next to user
3. Confirm deletion
4. User can no longer login

---

## 🔒 How It Works

### Login Process:
1. User enters email + password
2. System checks if email exists in `USER_CREDENTIALS`
3. System verifies password matches
4. If both correct → Login succeeds, role assigned
5. If email not found → "Email not authorized"
6. If password wrong → "Incorrect password"

### Passwords:
- Each user has their own password
- Stored in localStorage with user credentials
- Master admin can change any user's password
- Minimum 4 characters required
- Default passwords: `admin123` (change after first login!)

### Data Storage:
- User credentials (email + password + role) stored in **localStorage** (`sims_user_credentials`)
- Current session stored in **localStorage** (`sims_user`)
- Master admin can modify credentials via UI
- Passwords visible in admin panel for management

---

## 🎯 Permissions

### Master Admin (`adhammorsy2311@gmail.com`):
- ✅ All admin features
- ✅ Manage users (add/remove/change roles)
- ✅ Cannot be removed or demoted

### Other Admins:
- ✅ View all data
- ✅ Edit all data
- ✅ Upload files
- ✅ Apply bulk updates
- ✅ View audit logs
- ❌ Cannot manage users

### Viewers:
- ✅ View data (read-only)
- ✅ Filter and search
- ✅ View charts
- ✅ Export data
- ❌ Cannot edit
- ❌ Cannot upload
- ❌ Cannot manage users

---

## 🧪 Testing Checklist

- [ ] Login as `adhammorsy2311@gmail.com`
- [ ] See "👥 Manage Users" button
- [ ] Add a test viewer email
- [ ] Logout
- [ ] Login as test viewer
- [ ] Verify cannot edit data
- [ ] Verify no "Manage Users" button
- [ ] Logout
- [ ] Login as admin again
- [ ] Remove test viewer
- [ ] Verify viewer cannot login anymore

---

## 💾 Data Persistence

**User credentials stored in:**
```
localStorage: sims_user_credentials
```

**Export/import credentials:**
```javascript
// Export (copy from console)
console.log(localStorage.getItem('sims_user_credentials'));

// Import (paste in console)
localStorage.setItem('sims_user_credentials', 'paste_json_here');

// Example format:
{
  "user@example.com": {
    "password": "pass123",
    "role": "viewer"
  }
}
```

---

## 🔧 Changing Default Passwords

**Important: Change default passwords after first login!**

### Method 1: Via UI (Recommended)
1. Login as master admin
2. Click "👥 Manage Users"
3. Find your email
4. Enter new password
5. Click "Change Password"

### Method 2: Edit app.js Directly
Find this section in app.js:
```javascript
let USER_CREDENTIALS = {
    "adhammorsy2311@gmail.com": { 
        password: "YOUR_NEW_PASSWORD_HERE",  // ← Change this
        role: "admin" 
    },
    "adham.ahmed@hanwhaegypt.com": { 
        password: "YOUR_NEW_PASSWORD_HERE",  // ← Change this
        role: "admin" 
    }
};
```

---

## 🚨 Important Notes

1. **Security**: This is a simple system. For production, consider:
   - Real authentication system
   - Encrypted passwords
   - Session expiration
   - Two-factor authentication

2. **Backup**: Export credentials regularly:
   ```javascript
   console.log(localStorage.getItem('sims_user_credentials'));
   // Save this JSON somewhere safe (includes passwords!)
   ```

3. **Browser Data**: Clearing browser data will:
   - Log out current user
   - **Lose all user credentials** (unless backed up)
   - Need to re-add all users or import backup

4. **Multiple Devices**: Credentials are stored per-browser
   - Add users on one computer
   - Need to add again on another computer
   - Or export/import the credentials JSON

5. **Password Security**:
   - Passwords stored in plain text in localStorage
   - Visible to anyone with browser access
   - For better security, consider hashing passwords
   - This is a simple system, not enterprise-grade

---

## ✅ Advantages of This System

- ✅ No complex Supabase Auth setup
- ✅ Master admin has full control
- ✅ Easy to add/remove users
- ✅ Password protection included
- ✅ Change passwords anytime via UI
- ✅ Simple to understand and modify
- ⚠️ Passwords stored in plain text (acceptable for internal use)

---

## 📝 Complete File Checklist

- [ ] Database audit_log table updated
- [ ] login.html replaced
- [ ] app.js replaced
- [ ] Tested master admin login
- [ ] Tested adding users
- [ ] Tested viewer permissions
- [ ] Changed default passwords from `admin123`
- [ ] Tested password verification
- [ ] Exported credentials backup

---