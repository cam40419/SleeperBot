# Sleeper Coach

A private fantasy-football command center for Sleeper. It syncs leagues and rosters, flags injury/availability conflicts, uses AI plus current web research for recommendations, and can send scheduled email/SMS digests.

> Sleeper's official API is read-only. This app recommends actions but cannot submit lineup, waiver, trade, or draft changes through a supported Sleeper API.

## Run locally

1. Install Node.js 20.9+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set `SLEEPER_USERNAME`, `APP_PASSWORD`, and `AUTH_SECRET`.
4. Optionally add `OPENAI_API_KEY`, Resend, and/or Twilio credentials.
5. Run `npm run dev` and open http://localhost:3000.

If your network uses TLS inspection and Node reports `SELF_SIGNED_CERT_IN_CHAIN`, run `npm run dev:system-ca` instead. This keeps certificate verification enabled while allowing Node to trust certificates installed in the Windows system store. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Without an OpenAI key, the deterministic injury and lineup safety checks still work. With a key, analysis adds current web research, sourced recommendations, waiver/trade context, and narrative reasoning.

## Deploy to Vercel

Import this repository into Vercel, add the environment variables from `.env.example`, and deploy. Vercel invokes `/api/cron/digest` according to `vercel.json` and supplies the `CRON_SECRET` authorization header. Configure a verified Resend sender for email and/or Twilio numbers for SMS.

## Security

The app uses a signed, HTTP-only, same-site session cookie. Use long random values for `APP_PASSWORD`, `AUTH_SECRET`, and `CRON_SECRET`. Sleeper credentials are never requested or stored; only the public Sleeper username is needed.

## Current scope

- League, roster, starter, bench, and injury synchronization
- Deterministic availability checks that continue working if AI is unavailable
- AI research with structured, source-linked recommendations
- Daily and Sunday urgent digests via Resend and Twilio
- Private password access and cron authorization
- Vercel-ready deployment

Future production enhancements can add licensed projections/ADP data, historical decision storage, push notifications, draft-room polling, and calibration/backtesting. Those require provider choices and, for persistent history, a database.
