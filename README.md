# Gimbiya Mall — REST API Backend

Built on top of the MERN Advanced Auth starter, extended into a full multi-role e-commerce platform.

## Stack
- **Node.js + Express** — REST API
- **MongoDB Atlas + Mongoose** — Database
- **JWT + httpOnly Cookies** — Authentication (from MERN starter)
- **Mailtrap** — Transactional email
- **Firebase Admin** — File storage (KYC + signatures)
- **Redis (Upstash)** — Rate limiting + caching
- **Monnify** — Nigerian payment gateway

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your values
cp .env.example .env

# 3. Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Start development server
npm run dev
```

## Complete API Reference

### Auth (`/api/auth`)
| Method | Route | Auth | Body |
|--------|-------|------|------|
| POST | `/signup` | Public | `{ name, email, password, phone?, role?, assignedState? }` |
| POST | `/verify-email` | Public | `{ code }` |
| POST | `/login` | Public | `{ email, password }` |
| POST | `/logout` | Public | — |
| POST | `/forgot-password` | Public | `{ email }` |
| POST | `/reset-password/:token` | Public | `{ password }` |
| GET | `/check-auth` | JWT | — |

### Users (`/api/users`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/me` | JWT | Own profile |
| PATCH | `/me` | JWT | Update name/phone |
| GET | `/` | CEO/Coord | List users with filters |
| GET | `/:id` | CEO | Get any user |
| PATCH | `/:id/role` | CEO | Update role + state |

### Products (`/api/products`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/` | Public | `?assignedState=Tafawa%20balewa%20refinery&buildingFloor=LEVEL_1&page=1&limit=20` |
| GET | `/:id` | Public | Single product |
| POST | `/` | Merchant+ | Publish listing. `priceKobo` must be integer |
| GET | `/merchant/my-listings` | Merchant+ | Own listings |
| PATCH | `/:id/price` | Merchant | `{ priceKobo }` |
| PATCH | `/:id/toggle` | Merchant | `{ isActive }` |
| GET | `/merchant/analytics` | Merchant+ | Order breakdown + top products |
| GET | `/merchant/settlement` | Merchant+ | Escrow ledger entries |

### Orders (`/api/orders`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/cart` | Buyer | Get cart |
| POST | `/cart` | Buyer | `{ productId, quantity }` |
| POST | `/checkout` | Buyer | `{ cartItems[], shippingAddress, buyerPhone }` → returns `rawOtp` |
| GET | `/history` | Buyer | Order history |
| GET | `/:id` | Buyer | Order status + timeline |
| POST | `/:id/cancel` | Buyer | `{ reason }` |

### Stock (`/api/stock`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/manifest` | Stock+ | `?lowStockOnly=true&page=1&limit=50` |
| POST | `/adjust` | Stock+ | `{ productId, deltaCount, reasonCode }` — uses $inc ONLY |
| POST | `/inbound` | Stock+ | `{ items[{ productId, quantity }], invoiceRef? }` |
| GET | `/audit/:productId` | Stock+ | Append-only audit log |

### Delivery (`/api/delivery`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/jobs` | Rider | Available jobs in rider's state |
| GET | `/active` | Rider | Rider's active deliveries |
| POST | `/claim` | Rider | `{ orderId }` — atomic |
| POST | `/handover` | Rider | `{ orderId, submittedOtp, signatureBase64 }` |
| POST | `/location` | Rider | `{ orderId, lat, lng }` |

### CEO (`/api/ceo`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/metrics` | CEO | Platform health |
| GET | `/telemetry` | CEO | National GMV by state |
| GET | `/kyc` | CEO | `?status=PENDING` |
| POST | `/kyc/adjudicate` | CEO | `{ targetUserId, action, rejectionReason? }` |
| POST | `/users/revoke` | CEO | `{ targetUserId, reason }` |
| GET | `/escrow` | CEO/Auditor | Escrow summary by entry type |

### Affiliate (`/api/affiliate`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/click/:code` | Public | Track referral click |
| POST | `/campaigns` | Affiliate | `{ campaignName }` |
| GET | `/campaigns` | Affiliate | My campaigns |
| GET | `/analytics` | Affiliate | Summary + per-campaign stats |

### Marketplace V2 (`/api/cart-v2`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/quote` | JWT | Server-priced cart quote; optional `?ref=CODE` |
| POST | `/items` | JWT | `{ productId, quantity }` |
| POST | `/checkout` | JWT | `{ shippingAddress, affiliateReferralCode? }` |
| GET | `/orders` | JWT | Buyer's V2 order history |
| GET | `/orders/:orderRef` | JWT | Order details and handover codes |
| POST | `/orders/:orderRef/cancel` | JWT | Cancel an unpaid order |
| POST | `/fulfillment-groups/:groupId/confirm` | Merchant | Confirm a paid fulfillment group |
| POST | `/service-jobs/complete` | Merchant | Complete a service with its handover code |

### Invites (`/api/invites`)
| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/` | Inviter role | Create a role- and business-type-limited invitation |
| GET | `/` | Inviter role | List invitations |
| GET | `/public/:token` | Public | Preview an invitation |
| POST | `/public/:token/accept` | Public | Accept an invitation |
| GET | `/merchants/pending`, `/merchants/:storeId/verify` | HQ/coordinator | Review and verify invited merchants |

### Wallet, subscriptions, revenue, and performance
| Base route | Auth | Purpose |
|------------|------|---------|
| `/api/wallet` | JWT | Wallet balance, bank lookup, and withdrawal requests |
| `/api/wallet/admin/*` | HQ/auditor | Withdrawal review and platform wallet summary |
| `/api/subscriptions` | Business owner/HQ | Store plan status, checkout, and HQ plan changes |
| `/api/revenue` | HQ/coordinator/auditor | Read revenue configuration; HQ publishes changes |
| `/api/performance` | Coordinator/HQ/auditor | Affiliate performance and store referral attribution |

Optional configuration: `OTP_ENC_KEY` (32+ random characters; defaults to a key derived from `JWT_SECRET`), `UNPAID_HOLD_MINUTES` (default 30), `MONNIFY_TRANSFERS_ENABLED` (enable only after Monnify approves transfers), and `MONNIFY_WALLET_ACCOUNT_NUMBER` (required for automated withdrawals). Keep payment credentials in deployment environment settings, never in source control.

### Initial commercial data
After deployment, run these from the repository root in an environment with `MONGODB_URI` configured. Set a strong pilot password rather than committing it:

```bash
node backend/scripts/seedCommercialNodes.js
SEED_ALLOW=yes SEED_PASSWORD='choose-a-strong-password' node backend/scripts/seedPilot.js
```

### SSE (`/api/events/subscribe`)
Connect with `Authorization: Bearer {jwt}` header.

| Event | Sent To |
|-------|---------|
| `order:status_changed` | Buyer + Merchant |
| `order:rider_assigned` | Buyer + Merchant |
| `inventory:low_stock` | Merchant |
| `escrow:released` | Merchant |
| `kyc:status_changed` | Affected user |

## Critical Rules

1. **Stock:** ALWAYS `$inc`. NEVER `product.stock = x`
2. **Money:** ALWAYS Kobo integers. NEVER Naira floats stored in DB
3. **OTP:** never store a raw handover code. Store its bcrypt hash; the buyer-facing copy is AES-GCM encrypted and available only to the buyer.
4. **State boundary:** `assignedState` always from `req.userState` (session), never from request body
5. **Ledgers:** `EscrowLedger`, `InventoryAudit`, and wallet entries are append-only; never update or delete ledger rows.
6. **Payouts:** customer payments are collected by Gimbiya; seller, rider, affiliate, and platform wallet entries are credited after the handover code is accepted.

## Roles
| Role | Value |
|------|-------|
| Global CEO | `super_admin` |
| State Coordinator | `developer_coordinator` |
| Merchant | `business_owner` |
| Stock Manager | `stock_manager` |
| Delivery Rider | `delivery` |
| Affiliate | `affiliate` |
| Buyer | `buyer` |
