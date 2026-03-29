# SIMS Auth Migration Steps

## 1. Apply the schema changes in Supabase
Open the Supabase SQL Editor and run [sims_auth_schema.sql](/C:/Users/Victus%202/Logistics%20and%20Programming/3.%20Problem%20Solution%20Progrmming%20Projects/SIMS/SIMS-v3/sims_auth_schema.sql).

This adds and updates:

- `public.sims_users`
  - `id UUID`
  - `email TEXT UNIQUE`
  - `password_hash TEXT`
  - `password_plain TEXT`
  - `role TEXT` with `master_admin`, `admin`, `viewer`
- `public.audit_log`
  - makes `user_id` nullable
  - adds `table_name`
- grants `anon` and `authenticated` access needed by the current frontend flow

## 2. Create the first master admin user
The SQL file already seeds the previous hardcoded users. If you want to add more, insert them into `public.sims_users`.
`master_admin` can now see stored passwords in the Manage Users screen because the app also stores `password_plain`.

Use a SHA-256 password hash, not plain text. Example SQL:

```sql
INSERT INTO public.sims_users (email, password_hash, role)
VALUES (
  'your-email@example.com',
  'SHA256_HASH_HERE',
  'master_admin'
);
```

To generate the hash in the browser console:

```js
const text = "YourPasswordHere";
const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
console.log(hash);
```

## 3. Use the new login flow
The app no longer uses `localStorage` for credentials.

- [login.html](/C:/Users/Victus%202/Logistics%20and%20Programming/3.%20Problem%20Solution%20Progrmming%20Projects/SIMS/SIMS-v3/login.html) now checks `public.sims_users`
- [assets/scripts/app.js](/C:/Users/Victus%202/Logistics%20and%20Programming/3.%20Problem%20Solution%20Progrmming%20Projects/SIMS/SIMS-v3/assets/scripts/app.js) now reads `sessionStorage.currentUser`
- User management now creates, updates, and deletes rows in `public.sims_users`

## 4. Expected roles

- `master_admin`: can open Audit Log and Manage Users
- `admin`: can edit data, upload files, and bulk update
- `viewer`: read-only access

## 5. Verify after deployment

1. Log in with the seeded `master_admin`.
2. Open `Manage Users` and create an `admin` and a `viewer`.
3. Confirm new users can log in.
4. Confirm audit records are written for login, logout, add user, password change, role change, and delete user.
5. Confirm `admin` can edit data but cannot access the user-management controls.

## 6. Files already updated locally

- [login.html](/C:/Users/Victus%202/Logistics%20and%20Programming/3.%20Problem%20Solution%20Progrmming%20Projects/SIMS/SIMS-v3/login.html)
- [assets/scripts/app.js](/C:/Users/Victus%202/Logistics%20and%20Programming/3.%20Problem%20Solution%20Progrmming%20Projects/SIMS/SIMS-v3/assets/scripts/app.js)
- [updated-schema.sql](/C:/Users/Victus%202/Logistics%20and%20Programming/3.%20Problem%20Solution%20Progrmming%20Projects/SIMS/SIMS-v3/updated-schema.sql)
- [sims_auth_schema.sql](/C:/Users/Victus%202/Logistics%20and%20Programming/3.%20Problem%20Solution%20Progrmming%20Projects/SIMS/SIMS-v3/sims_auth_schema.sql)

## 7. Clean up old credential storage
The old `sims_user_credentials` browser storage is obsolete. In the browser console, run:

```js
localStorage.removeItem("sims_user_credentials");
sessionStorage.removeItem("sims_user");
```
