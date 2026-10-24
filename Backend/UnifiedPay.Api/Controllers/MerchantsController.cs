using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UnifiedPay.Api.Data;
using UnifiedPay.Api.Domain;
using UnifiedPay.Api.Dtos;
using UnifiedPay.Api.Services;

namespace UnifiedPay.Api.Controllers;

[ApiController]
[Route("v1/merchants")]
[Authorize(Roles = "Merchant")]
public class MerchantsController(AppDbContext db, PaymentOrchestrationService payments) : ControllerBase
{
    [HttpGet("me")]
    public async Task<ActionResult<MerchantDto>> Me(CancellationToken ct)
    {
        var id = GetMerchantId();
        var m = await db.Merchants.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (m is null) return NotFound();
        return Ok(ToDto(m));
    }

    [HttpGet("me/transactions")]
    public async Task<ActionResult<object>> MyTransactions(CancellationToken ct)
    {
        var id = GetMerchantId();
        var rows = await db.Transactions
            .Include(t => t.Order)
            .Where(t => t.Order.MerchantId == id)
            .OrderByDescending(t => t.CreatedAt)
            .Take(100)
            .Select(t => new
            {
                t.Id,
                t.OrderId,
                t.Order.MerchantOrderRef,
                t.Rail,
                t.GatewayCode,
                t.AmountPaise,
                Status = t.Status.ToString(),
                t.Utr,
                t.CreatedAt
            })
            .ToListAsync(ct);
        return Ok(new { data = rows });
    }

    [HttpGet("me/transactions/{transactionId:guid}")]
    public async Task<ActionResult<object>> TransactionDetail(Guid transactionId, CancellationToken ct)
    {
        var id = GetMerchantId();
        var txn = await LoadOwned(id, transactionId, ct);
        if (txn is null) return NotFound();
        return Ok(TransactionView.Detail(txn));
    }

    [HttpGet("me/history/{bucket}")]
    public async Task<ActionResult<object>> History(string bucket, CancellationToken ct)
    {
        var id = GetMerchantId();
        var query = db.Transactions.Include(t => t.Order).Include(t => t.Refunds)
            .Where(t => t.Order.MerchantId == id);

        query = bucket.ToLowerInvariant() switch
        {
            "success" => query.Where(t => t.Status == PaymentStatus.Success),
            "failed" => query.Where(t => t.Status == PaymentStatus.Failed),
            "reversed" => query.Where(t => t.Status == PaymentStatus.Reversed),
            "settlement" => query.Where(t => t.Status == PaymentStatus.Success || t.Status == PaymentStatus.Reversed),
            _ => query
        };

        var rows = await query.OrderByDescending(t => t.CreatedAt).Take(100).ToListAsync(ct);
        return Ok(new { data = rows.Select(TransactionView.Summary) });
    }

    [HttpGet("me/accounts")]
    public async Task<ActionResult<object>> Accounts(CancellationToken ct)
    {
        var id = GetMerchantId();
        var rows = await db.SettlementAccounts.Where(a => a.MerchantId == id)
            .OrderByDescending(a => a.IsDefault)
            .ThenBy(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id,
                a.Label,
                a.BankName,
                a.HolderName,
                a.Ifsc,
                a.AccountLast4,
                a.IsDefault
            })
            .ToListAsync(ct);
        return Ok(new { data = rows });
    }

    [HttpPost("me/accounts")]
    public async Task<ActionResult<object>> AddAccount([FromBody] AddSettlementAccountRequest req, CancellationToken ct)
    {
        var acct = (req.AccountNumber ?? "").Trim();
        var ifsc = (req.Ifsc ?? "").Trim().ToUpperInvariant();
        if (acct.Length < 6 || ifsc.Length != 11)
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Enter a valid account number and 11-character IFSC.", HttpContext.TraceIdentifier)));

        var id = GetMerchantId();
        var last4 = acct[^4..];
        var exists = await db.SettlementAccounts.AnyAsync(a => a.MerchantId == id && a.Ifsc == ifsc && a.AccountLast4 == last4, ct);
        if (exists)
            return Conflict(new ErrorResponse(new ApiError("DUPLICATE_ORDER", "This bank account is already saved.", HttpContext.TraceIdentifier)));

        var row = new SettlementAccount
        {
            MerchantId = id,
            Label = string.IsNullOrWhiteSpace(req.Label) ? req.BankName : req.Label.Trim(),
            BankName = req.BankName.Trim(),
            HolderName = req.HolderName.Trim(),
            Ifsc = ifsc,
            AccountLast4 = last4,
            IsDefault = !await db.SettlementAccounts.AnyAsync(a => a.MerchantId == id, ct)
        };
        db.SettlementAccounts.Add(row);
        await db.SaveChangesAsync(ct);
        return Ok(new { row.Id, row.Label, row.BankName, row.HolderName, row.Ifsc, row.AccountLast4, row.IsDefault });
    }

    [HttpPost("me/card-to-bank")]
    public async Task<ActionResult<PaymentDto>> CardToBank([FromBody] CardToBankRequest req, CancellationToken ct)
    {
        try
        {
            return Ok(await payments.TransferCardToBankAsync(GetMerchantId(), req, ct));
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }

    [HttpPost("me/transactions/{transactionId:guid}/reverse")]
    public async Task<ActionResult<RefundDto>> Reverse(Guid transactionId, CancellationToken ct)
    {
        try
        {
            return Ok(await payments.ReverseAsync(GetMerchantId(), transactionId, "Dashboard reversal", ct));
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }

    private async Task<PaymentTransaction?> LoadOwned(Guid merchantId, Guid transactionId, CancellationToken ct) =>
        await db.Transactions.Include(t => t.Order).ThenInclude(o => o.Merchant).Include(t => t.Refunds)
            .FirstOrDefaultAsync(t => t.Id == transactionId && t.Order.MerchantId == merchantId, ct);

    private Guid GetMerchantId() =>
        Guid.Parse(User.FindFirstValue("merchant_id") ?? User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static MerchantDto ToDto(Merchant m) => new(
        m.Id, m.LegalName, m.BrandName, m.Email, m.MobileE164, m.PanMasked, m.Gstin, m.Mcc,
        m.WebsiteUrl, m.SettlementIfsc, m.SettlementAccountLast4, m.Status.ToString(), m.ApiKey, m.PlatformFeePercent);
}
