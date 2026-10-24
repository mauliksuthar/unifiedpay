# UnifiedPay Frontend (Phase 1)

**Path:** `G:\UnifiedPay\Frontend`  
**Stack:** Next.js (latest)

## Run

```powershell
cd G:\UnifiedPay\Frontend
npm install
npm run dev
```

Open http://localhost:3000

Requires Backend at `http://localhost:5280` (see `G:\UnifiedPay\Backend`).

## Phase 1 pages

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/register` | Merchant signup + KYC |
| `/login` | Merchant login |
| `/dashboard` | Orders, card pay, transactions |
| `/checkout/[orderId]` | Hosted checkout entry |
| `/admin` | Freeze merchant + weekly commission invoice |

## Money rules (UI messaging)

- Card collect via PG hosted/mock checkout  
- Settlement → merchant bank  
- Commission → UnifiedPay fee account by invoice  
