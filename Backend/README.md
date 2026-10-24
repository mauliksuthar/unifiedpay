# UnifiedPay Backend (Phase 1)

**Path:** `G:\UnifiedPay\Backend`  
**Stack:** ASP.NET Core (latest) + SQL Server + EF Core

## Phase 1 rules (from platform doc)

- Credit card collect via **third-party / mock PG**
- Customer funds settle to **merchant bank** (via PG) — **never** into UnifiedPay operating accounts
- UnifiedPay earns **commission by invoice** to its fee bank account
- **No PAN/CVV** stored or accepted on UnifiedPay APIs

## Run

```powershell
cd G:\UnifiedPay\Backend\UnifiedPay.Api
dotnet restore
dotnet run
```

- API: http://localhost:5280  
- OpenAPI: http://localhost:5280/openapi/v1.json  
- Health: http://localhost:5280/health  

Requires **SQL Server LocalDB** (or change `ConnectionStrings:Default` in `appsettings.json` to Azure SQL / full SQL Server).

## Main endpoints

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/v1/auth/merchant/register` | — |
| POST | `/v1/auth/merchant/login` | — |
| POST | `/v1/auth/admin/login` | — |
| GET | `/v1/merchants/me` | Merchant JWT |
| POST | `/v1/orders` | Merchant JWT |
| POST | `/v1/orders/{id}/payments` | Merchant JWT + `Idempotency-Key` |
| GET | `/v1/payments/{id}` | — |
| POST | `/v1/webhooks/payments` | — (PG webhook) |
| GET | `/v1/checkout/mock` | Mock PG hosted page |
| POST | `/v1/admin/merchants/{id}/freeze` | Admin JWT |
| POST | `/v1/admin/merchants/{id}/invoices/weekly` | Admin JWT |

Default admin: `admin@unifiedpay.local` / `ChangeMeAdmin!23`

## Replace mock PG

Implement `IPaymentGateway` with Razorpay/Cashfree SDK and register it in `Program.cs` instead of `MockRazorpayGateway`.
