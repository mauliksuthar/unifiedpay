# UnifiedPay — Phase 1

Architecture doc: `D:\UnifiedPay\docs\UnifiedPay-Platform-Documentation.md`

## Folders

| Path | Stack | Phase 1 |
| --- | --- | --- |
| `G:\UnifiedPay\Backend` | ASP.NET Core + SQL Server | **Active** |
| `G:\UnifiedPay\Frontend` | Next.js | **Active** |
| `G:\UnifiedPay\Mobile-app` | React Native | Deferred after web MVP |

## Money rules

1. Customer pays by **credit card** via PG (mock now → Razorpay/Cashfree later)  
2. Settlement → **merchant bank** (via PG)  
3. Commission → **UnifiedPay fee bank** by **invoice**  
4. Customer funds **never** enter UnifiedPay operating accounts  

## Run locally

**Terminal 1 — API**

```powershell
cd G:\UnifiedPay\Backend\UnifiedPay.Api
dotnet run
```

http://localhost:5280

**Terminal 2 — Web**

```powershell
cd G:\UnifiedPay\Frontend
npm run dev
```

http://localhost:3000

## Demo flow

1. Open http://localhost:3000/register — create merchant (PAN + settlement bank)  
2. Dashboard → create order (e.g. ₹100) → Pay with card  
3. Mock PG page → Simulate SUCCESS  
4. See transaction + UTR on dashboard  
5. Admin (`admin@unifiedpay.local` / `ChangeMeAdmin!23`) → Weekly invoice  

## Requirements

- .NET 10 SDK  
- Node.js 20+  
- SQL Server LocalDB (or change connection string in `Backend\UnifiedPay.Api\appsettings.json`)  
