# Privadinhos Online

This repository is a standalone public copy of the Privadinhos Online application.

## Deployment

The production deployment is available at [privonline-novo.vercel.app](https://privonline-novo.vercel.app).

The Vercel project currently uses CLI deployments. It is not connected to this GitHub repository for automatic deployments. Configure an active Supabase URL and publishable key in Vercel to load the catalog. Server features also require the private environment variables listed in `.env.example`.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## SyncPay

The Pix checkout uses the SyncPay Partner API entirely from the server. Copy
`.env.example` to the environment configuration used by the deployment and set
`SYNC_PAY_CLIENT_ID`, `SYNC_PAY_CLIENT_SECRET`, and the public HTTPS callback in
`SYNC_PAY_WEBHOOK_URL`.

Use this callback path:

```text
https://your-domain.example/api/public/webhooks/syncpay
```

The application creates orders as `pending`. A webhook never grants access by
itself: the server queries SyncPay's authenticated transaction endpoint and
checks the identifier, amount, and final status first. Private media queries
also require an active access row linked to an order whose status is `paid`.

## ONPAY

The ONPAY PIX integration uses `POST /api/v2/payments` and confirms every
payment through the authenticated transaction endpoint or a signed webhook.
Configure a stable `PAYMENT_CREDENTIALS_ENCRYPTION_KEY` in the deployment, then
save the ONPAY API key and webhook signing secret in **Admin → Configurações →
Pagamentos**. Register this callback in ONPAY:

```text
https://your-domain.example/api/public/webhooks/onpay
```

The checkout sends the buyer's name and phone. CPF and email are deterministic
technical values generated only for the payment request.
