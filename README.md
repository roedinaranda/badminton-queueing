# Sunday's Bets — Badminton Queue v3

Mobile-first badminton queue for Netlify + Supabase.

## New in this version
- Admin sets 1–12 available courts for the current session.
- Multiple courts can run simultaneously.
- "Fill Available Courts" automatically starts as many matches as the queue can support.
- Each court has its own live match.
- Finished players automatically return to the back of the current queue.
- Players select Beginner / Intermediate / Advanced at registration.
- No numeric player rating.
- Admin enters both scores; winner is calculated automatically.
- Join Queue modal displays a real QR code pointing to `?join=1`; scanning opens the app and the join form.

## IMPORTANT: you already created the original schema
Do NOT replace your database with the new schema.

Run this file in Supabase SQL Editor instead:

`supabase/migration-multiple-courts.sql`

It adds:
- `queue_sessions`
- `queue.session_id`
- `matches.session_id`
- realtime for sessions

It also creates an initial open session with 2 courts and attaches existing waiting/live rows to it.

## Install the updated app

```bash
npm install
npm run dev
```

The new dependency is `qrcode.react`.

## Environment

Create `.env`:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Never put a Supabase service-role/secret key in this file.

## Netlify

Build command:

`npm run build`

Publish directory:

`dist`

Add the same two VITE environment variables in Netlify.

## QR behavior

When a user clicks **JOIN QUEUE**, the app displays a QR code for:

`https://your-netlify-site.netlify.app/?join=1`

Scanning it opens the app and automatically opens the registration/join screen.

For the venue, you can simply print that QR code once. The Netlify URL remains the same after redeployments.

## Production security

The MVP policies are deliberately permissive for setup/testing. Before public use, secure admin mutations with Supabase Auth and an admin role/RPC. Players should only be allowed to create/update their own queue entry.
