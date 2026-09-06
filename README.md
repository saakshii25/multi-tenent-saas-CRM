# White-label Ordering + CRM SaaS (multi-tenant)

One codebase, one ordering engine, one admin engine, many tenants, many domains.

```
thewhitemug.site/order  ->  Host header  ->  domains collection  ->  tenant White Mug
abchotel.com/order      ->  Host header  ->  domains collection  ->  tenant ABC Hotel
```

## Apps

| Path | Who | What |
|------|-----|------|
| `/` | customer | Tenant landing page |
| `/order`, `/order/cart`, `/order/checkout`, `/order/orders/:id`, `/order/account` | customer | Menu, cart, OTP sign-in, checkout (delivery / pickup / dine-in / room service), live tracking |
| `/order?table=12` / `/order?room=305` | customer | QR ordering entry points |
| `/admin/*` | merchant staff | Dashboard, live order board, menu, CRM, coupons, reports, settings, staff |
| `/platform/*` | super admin | Tenants, domains (DNS TXT verification), platform metrics |
| `/api/*` | all | Single catch-all route dispatching to `lib/api/{customer,admin,platform}.js` |

## Tenant resolution (server-controlled)

`lib/tenant.js` reads the `Host` header, looks it up in `domains` (`status: active`) and loads the tenant.
On platform hosts only (preview URL / localhost) a `preview_tenant` cookie can select a tenant for demos.
Client-supplied tenant ids are never trusted; every query is scoped by `tenant_id`.
Session cookies (`cust_session`, `staff_session`, `platform_session`) embed the tenant id and are rejected on other tenants' domains.

## Demo tenants & logins

| Tenant | Domain(s) | Staff login |
|--------|-----------|-------------|
| White Mug (cafe, default preview) | thewhitemug.site, white-mug.local | owner@whitemug.demo / admin123 · kitchen@whitemug.demo / kitchen123 · rider@whitemug.demo / kitchen123 |
| ABC Hotel (hotel) | abchotel.com | owner@abchotel.demo / admin123 |
| Platform console | preview host `/platform` | admin@platform.demo / super123 |

Customers sign in with phone + OTP. Without an SMS provider the code is returned in the response (`OTP_DEV_MODE=true`) and shown in the UI.

## Local development

```bash
cp .env.example .env   # fill JWT_SECRET, MONGO_URL, DB_NAME
yarn install
yarn dev               # http://localhost:3000 (seeds both demo tenants on first API call)
```

Test a custom domain locally without DNS:

```bash
curl -H "Host: abchotel.com" http://localhost:3000/api/tenant
```

or add `127.0.0.1 white-mug.local` to `/etc/hosts` and open http://white-mug.local:3000/order.

## Production domain flow

1. Super admin adds the domain in `/platform/domains` (a verification token is generated).
2. Merchant adds `TXT _saas-verify.<domain> = <token>` and a proxied `CNAME <domain> -> platform` in Cloudflare.
3. "Check DNS" verifies and activates the domain; SSL is terminated by Cloudflare.
4. Requests for `<domain>/order` and `<domain>/admin` now resolve to that tenant. The browser URL never changes.

## Order state machine

`ORDER_PLACED -> ACCEPTED -> PREPARING -> READY -> (OUT_FOR_DELIVERY) -> DELIVERED`, failure states `REJECTED / CANCELLED -> REFUND_PENDING -> REFUNDED`. Transitions are validated in `lib/orders.js` (`TRANSITIONS`, `ROLE_TRANSITIONS`) and applied atomically.

## Payments

`payment_method` is provider-abstracted per tenant. V1 ships pay-on-delivery / at counter. Razorpay keys can be stored per tenant in Settings → Payments; the online checkout adapter (order creation, signature + webhook verification, refunds) is the next milestone.

## Collections

tenants, domains, users, customers, otp_codes, categories, products (variants/addons embedded), orders (items embedded), payments, refunds, coupons, coupon_usage, delivery_assignments, notifications, audit_logs, analytics_events, counters.
