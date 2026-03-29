# Repository Guidelines

## Project Structure & Module Organization
This repository is a static dashboard app with a small set of support scripts. The entry pages are `index.html` for the dashboard and `login.html` for authentication. Frontend assets live under `assets/`: JavaScript in `assets/scripts/app.js`, styles in `assets/styles/style.css`, and logos in `assets/img/`. Database setup is tracked in `updated-schema.sql`. Operational notes and setup walkthroughs are kept in the root `*.md` files. Python utilities such as `upload_to_supabase.py` and `remove_data_from_database.py` are used for one-off data operations.

## Build, Test, and Development Commands
There is no formal build step.

- `python -m http.server 8000` serves the site locally for UI checks.
- `python upload_to_supabase.py` uploads spreadsheet data into the configured Supabase table.
- `python remove_data_from_database.py` deletes records from the configured table; review the filter before running it.
- Apply `updated-schema.sql` in the Supabase SQL Editor when schema changes are needed.

## Coding Style & Naming Conventions
Use 4 spaces for HTML, CSS, JavaScript, and Python to match the existing codebase. Prefer descriptive camelCase for JavaScript variables and functions such as `checkAuthentication` and `loadUserCredentials`. Keep CSS class names lowercase with hyphenated words like `chart-card` and `bulk-actions`. In Python, follow PEP 8 and use snake_case for functions and variables. Keep changes small and localized; this project currently uses single-file frontend modules.

## Testing Guidelines
No automated test suite is present, so validate changes manually before opening a PR. At minimum:

- Load `login.html` and `index.html` locally.
- Verify filtering, table rendering, export, and role-based UI behavior.
- If database logic changes, test against a non-production Supabase project first.
- For upload scripts, use a small sample workbook before bulk imports.

## Commit & Pull Request Guidelines
This repository has no established commit history yet, so use imperative, scoped commit messages such as `Add audit log filter validation` or `Fix upload null date handling`. Pull requests should include a short summary, the affected files or data flow, manual test notes, and screenshots for visible UI changes. Link the relevant issue or operational note when applicable.

## Security & Configuration Tips
Do not commit real service-role keys, passwords, or personal file paths. Keep environment-specific values out of frontend code whenever possible, and rotate any credential that was exposed during development.
