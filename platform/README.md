# Helper Marketplace

A subscription marketplace where **employment agencies pay to source domestic helpers**.
Helpers create a profile for free; agencies subscribe to see full biodata and message helpers.

This is a separate product from the Kin Domestic website in the repository root. It is a Node.js app
(it needs a server and a database), so it **cannot** run on GitHub Pages. Move this folder into its own
repository before going live.

## What it does

| Who | Can |
| --- | --- |
| **Helper** (free) | Sign up, fill in biodata, upload a photo, submit for review, hide/show profile, see how many agencies viewed it, reply to agencies |
| **Agency** (not subscribed) | Sign up with licence number + UEN, search helpers, see profile previews |
| **Agency** (subscribed) | See full biodata, shortlist helpers |
| **Agency** (subscribed **and** verified by admin) | Message helpers, see phone numbers (if the helper opted in) |
| **Admin** | Approve/reject helper profiles, verify agencies, grant manual subscriptions (bank transfer/invoice), suspend accounts |

Payments use **Stripe Checkout** + the **Stripe customer portal** (cancel, change card, invoices).
Stripe is optional: without keys, admins switch subscriptions on by hand from *Admin → Agencies*.

## Run it locally

Requires Node.js 22.13 or newer.

```sh
cd platform
npm install
cp .env.example .env          # then edit ADMIN_EMAIL / ADMIN_PASSWORD
npm run seed -- --demo        # creates the admin + fictional demo helpers and a demo agency
npm start                     # http://localhost:3000
```

Demo logins (only with `--demo`): `agency@example.com` / `demo-password`, `helper1@example.com` / `demo-password`.

Run the tests with `npm test`.

## Setting up Stripe

1. In the Stripe dashboard, create a product with a monthly and a yearly recurring **price**.
2. Put the secret key and the two price IDs (`price_…`) in `.env`, and the display prices in `PLAN_*_LABEL`.
3. Add a webhook endpoint `https://<your-domain>/billing/webhook` for the events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`
   and `customer.subscription.deleted`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Turn on the customer portal (Settings → Billing → Customer portal).

## Deploying

The app keeps everything in one folder, `data/` (SQLite database + uploaded photos). Any host with a
**persistent disk** works: Render (with a disk), Railway (with a volume), Fly.io (with a volume), or a small VPS.
A `Dockerfile` is included; mount a volume at `/app/data`.

In production set `NODE_ENV=production` (secure cookies; the app trusts one proxy for HTTPS) and `BASE_URL`
to your public `https://` address. Back up `data/` regularly.

## Code map

| Path | Purpose |
| --- | --- |
| `src/server.js` | App setup, security headers, middleware, route mounting |
| `src/db.js` | SQLite schema (Node's built-in `node:sqlite`) |
| `src/auth.js` | Password hashing (scrypt), sessions, CSRF, role guards, login rate limit |
| `src/models.js` | Subscription rules (`subscriptionActive`, `canContact`) and input cleaning |
| `src/views.js`, `src/profileView.js` | HTML templates (auto-escaped) |
| `src/routes/*.js` | Pages: public, auth, helper, agency, messages, billing (Stripe), admin |
| `public/` | CSS, small JS, placeholder image |
| `scripts/seed.js` | Creates the first admin (and optional demo data) |
| `test/app.test.js` | End-to-end tests of the main flows |

## Before launch

- **Licensing:** check with MOM (or a lawyer) whether running this platform needs an employment agency
  licence under the Employment Agencies Act. This depends on how involved the platform is in placements.
- **PDPA:** replace the placeholder `/terms` and `/privacy` pages, appoint a Data Protection Officer, and
  decide how long you keep data for inactive accounts.
- Pick a name and set `APP_NAME`; update the pricing labels.
- Helper profiles must never contain passport numbers, FIN, work permit numbers, dates of birth or addresses.
  The profile form warns helpers, and admins should check for these when approving profiles.

## Not built yet (ideas for v2)

Email notifications (new message, profile approved), password reset by email, helper video intros,
employer (family) accounts and job posts, saved searches, and multi-language UI (Burmese, Bahasa, Tagalog).
