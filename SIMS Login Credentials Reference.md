# 🔐 SIMS Login Credentials

## Default Admin Accounts

| Email | Password | Role |
|-------|----------|------|
| adhammorsy2311@gmail.com | `admin123` | Admin (Master) |
| adham.ahmed@hanwhaegypt.com | `admin123` | Admin |

**⚠️ IMPORTANT: Change these passwords immediately after first login!**

---

## Quick Actions

### 🔄 Change Your Password

1. Login as admin
2. Click **"👥 Manage Users"**
3. Find your email in the list
4. Enter new password in the password field
5. Click **"Change Password"**
6. Done! ✅

### 👤 Add New User

1. Login as `adhammorsy2311@gmail.com` (master admin)
2. Click **"👥 Manage Users"**
3. Fill in:
   - **Email**: user@example.com
   - **Password**: their_password (min 4 chars)
   - **Role**: Admin or Viewer
4. Click **"Add User"**
5. New user can now login with that email and password

### 🔑 Reset Someone's Password

1. Login as master admin
2. Click **"👥 Manage Users"**
3. Find the user
4. Enter new password
5. Click **"Change Password"**
6. Tell them their new password

### 🗑️ Remove User

1. Login as master admin
2. Click **"👥 Manage Users"**
3. Find the user
4. Click **"Remove"**
5. Confirm deletion
6. User immediately loses access

---

## Password Requirements

- **Minimum length**: 4 characters
- **No special requirements** (for simplicity)
- **Case sensitive**: `Admin123` ≠ `admin123`
- **No expiration**: Passwords don't expire
- **Visible to master admin**: All passwords visible in user management

---

## Security Notes

### ✅ What's Secure:
- Password verification on login
- Master admin control
- Audit logging of all actions
- Session management

### ⚠️ What's NOT Secure:
- Passwords stored in plain text (localStorage)
- No password hashing
- No 2FA
- No password recovery
- Anyone with browser access can see credentials

### 💡 Best Practices:
1. **Change default passwords** immediately
2. **Use unique passwords** for each user
3. **Export credentials backup** regularly
4. **Don't share** master admin access
5. **Review user list** monthly
6. **Remove** inactive users

---

## Backup & Recovery

### Export Credentials (Master Admin)

```javascript
// Open browser console (F12)
console.log(localStorage.getItem('sims_user_credentials'));

// Copy the output and save it somewhere safe
// Example output:
// {"user@example.com":{"password":"pass123","role":"viewer"}}
```

### Import Credentials (Emergency Recovery)

```javascript
// If you lose all users, paste this in console:
localStorage.setItem('sims_user_credentials', '{"adhammorsy2311@gmail.com":{"password":"admin123","role":"admin"}}');

// Then refresh the page
location.reload();
```

---

## Troubleshooting

### "Email not authorized"
- Email not in user list
- Contact master admin to add you
- Or check spelling of email

### "Incorrect password"
- Password is wrong
- Passwords are case-sensitive
- Contact master admin to reset

### Forgot Master Admin Password?
```javascript
// Emergency reset (in browser console):
let creds = JSON.parse(localStorage.getItem('sims_user_credentials'));
creds["adhammorsy2311@gmail.com"].password = "newpassword123";
localStorage.setItem('sims_user_credentials', JSON.stringify(creds));
// Now login with: adhammorsy2311@gmail.com / newpassword123
```

### Lost All User Data?
1. Open browser console (F12)
2. Paste:
   ```javascript
   localStorage.setItem('sims_user_credentials', JSON.stringify({
       "adhammorsy2311@gmail.com": { password: "admin123", role: "admin" }
   }));
   ```
3. Refresh page
4. Login with default credentials
5. Re-add other users

---

## For Master Admin

### Regular Tasks:
- [ ] Review user list monthly
- [ ] Remove inactive users
- [ ] Backup credentials weekly
- [ ] Change your password quarterly
- [ ] Audit user access logs

### User Requests:
- **Password reset**: Change it for them in User Management
- **Access request**: Add them via User Management
- **Role change**: Update via dropdown in User Management
- **Account removal**: Click Remove button

---

## Quick Password Change Script

Want to change multiple passwords at once?

```javascript
// Open browser console
let creds = JSON.parse(localStorage.getItem('sims_user_credentials'));

// Change specific user
creds["user@example.com"].password = "newpass123";

// Save
localStorage.setItem('sims_user_credentials', JSON.stringify(creds));

// Refresh
location.reload();
```

---

## Template for New Users

When adding a new user, send them:

```
🔐 SIMS Access Granted

Your login credentials:
Email: [their email]
Password: [their password]
Role: [Admin/Viewer]

Login at: [your SIMS URL]

⚠️ Please change your password after first login:
1. Click "👥 Manage Users"
2. Find your email
3. Enter new password
4. Click "Change Password"

Questions? Contact: adhammorsy2311@gmail.com
```