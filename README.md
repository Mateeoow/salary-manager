# Salary Manager

A personal finance dashboard for tracking salaries, deductions, savings, and custom categories. The frontend is ready for Netlify and the data is stored in Supabase.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com/).
2. In Supabase, open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Authentication → Providers**, enable **Anonymous Sign-Ins**.
4. Open **Project Settings → API** and copy the **Project URL** and **Publishable key**. Older projects may call this the `anon` key.
5. Paste them into [`public/supabase-config.js`](public/supabase-config.js).

Never put a `service_role` or secret key in `supabase-config.js`. The database is protected by Row Level Security policies, and the browser uses an anonymous Supabase session so each browser gets its own data.

## Deploy to Netlify

1. Push the repository to GitHub.
2. In Netlify, choose **Add new project → Import an existing project**.
3. Select the GitHub repository.
4. Use these settings:
   - Build command: leave blank
   - Publish directory: `public`
5. Deploy the site.

The included `netlify.toml` already sets the publish directory to `public`.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Supabase must be configured first for data to load.
