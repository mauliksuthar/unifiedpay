using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UnifiedPay.Api.Data;
using UnifiedPay.Api.Domain;
using UnifiedPay.Api.Dtos;
using UnifiedPay.Api.Services;

namespace UnifiedPay.Api.Controllers;

[ApiController]
[Route("v1/admin")]
[Authorize(Roles = "Admin")]
public class AdminController(AppDbContext db, PaymentOrchestrationService payments) : ControllerBase
{
    [HttpGet("merchants")]
    public async Task<ActionResult<object>> Merchants(CancellationToken ct)
    {
        var rows = await db.Merchants.OrderByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id,
                m.LegalName,
                m.BrandName,
                m.Email,
                m.MobileE164,
                m.PanMasked,
                m.Gstin,
                m.Mcc,
                m.WebsiteUrl,
                m.SettlementIfsc,
                m.SettlementAccountLast4,
                Status = m.Status.ToString(),
                m.PlatformFeePercent,
                m.CreatedAt
            })
            .ToListAsync(ct);
        return Ok(new { data = rows });
    }

    [HttpPost("merchants")]
    public async Task<ActionResult<object>> CreateMerchant([FromBody] AdminMerchantRequest req, CancellationToken ct)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var password = req.Password ?? "";
        var pan = (req.Pan ?? "").Trim().ToUpperInvariant();
        var account = (req.SettlementAccountNumber ?? "").Trim();
        var ifsc = (req.SettlementIfsc ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(req.LegalName) || string.IsNullOrWhiteSpace(email))
            return Validation("Legal name and email are required.");
        if (password.Length < 8)
            return Validation("Password must be at least 8 characters.");
        if (pan.Length < 10)
            return Validation("A 10-character PAN is required.");
        if (ifsc.Length != 11 || account.Length < 4)
            return Validation("Enter an 11-character IFSC and the settlement account number.");
        if (await db.Merchants.AnyAsync(m => m.Email == email, ct))
            return Conflict(new ErrorResponse(new ApiError("DUPLICATE_ORDER", "Email already registered.", HttpContext.TraceIdentifier)));

        if (FeeError(req.PlatformFeePercent, out var fee) is { } feeMessage)
            return Validation(feeMessage);

        var apiKey = $"up_live_{Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant()}";
        var apiSecret = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var merchant = new Merchant
        {
            LegalName = req.LegalName.Trim(),
            BrandName = NullIfBlank(req.BrandName),
            Email = email,
            MobileE164 = (req.MobileE164 ?? "").Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            PanMasked = $"{pan[..5]}****{pan[^1]}",
            Gstin = NullIfBlank(req.Gstin),
            Mcc = string.IsNullOrWhiteSpace(req.Mcc) ? "5411" : req.Mcc.Trim(),
            WebsiteUrl = (req.WebsiteUrl ?? "").Trim(),
            SettlementIfsc = ifsc,
            SettlementAccountLast4 = account[^4..],
            Status = MerchantStatus.Active,
            ApiKey = apiKey,
            ApiSecretHash = BCrypt.Net.BCrypt.HashPassword(apiSecret),
            PlatformFeePercent = fee
        };
        db.Merchants.Add(merchant);
        db.SettlementAccounts.Add(new SettlementAccount
        {
            MerchantId = merchant.Id,
            Label = "Primary",
            BankName = "Settlement bank",
            HolderName = merchant.LegalName,
            Ifsc = merchant.SettlementIfsc,
            AccountLast4 = merchant.SettlementAccountLast4,
            IsDefault = true
        });
        db.AuditLogs.Add(new AuditLog
        {
            ActorType = "ADMIN",
            Action = "CREATE_MERCHANT",
            EntityType = "Merchant",
            EntityId = merchant.Id
        });
        await db.SaveChangesAsync(ct);
        return Ok(ToRow(merchant));
    }

    [HttpPut("merchants/{merchantId:guid}")]
    public async Task<ActionResult<object>> UpdateMerchant(Guid merchantId, [FromBody] AdminMerchantRequest req, CancellationToken ct)
    {
        var merchant = await db.Merchants.FirstOrDefaultAsync(m => m.Id == merchantId, ct);
        if (merchant is null) return NotFound();

        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(req.LegalName) || string.IsNullOrWhiteSpace(email))
            return Validation("Legal name and email are required.");
        if (await db.Merchants.AnyAsync(m => m.Email == email && m.Id != merchantId, ct))
            return Conflict(new ErrorResponse(new ApiError("DUPLICATE_ORDER", "Email already registered.", HttpContext.TraceIdentifier)));

        if (FeeError(req.PlatformFeePercent, out var fee) is { } feeMessage)
            return Validation(feeMessage);

        if (!string.IsNullOrWhiteSpace(req.Password) && req.Password.Trim().Length < 8)
            return Validation("Password must be at least 8 characters.");

        var pan = (req.Pan ?? "").Trim().ToUpperInvariant();
        if (pan.Length > 0 && pan.Length < 10)
            return Validation("PAN must be 10 characters.");

        var ifsc = (req.SettlementIfsc ?? "").Trim().ToUpperInvariant();
        if (ifsc.Length > 0 && ifsc.Length != 11)
            return Validation("IFSC must be 11 characters.");

        var account = (req.SettlementAccountNumber ?? "").Trim();
        if (account.Length > 0 && account.Length < 4)
            return Validation("Enter the full settlement account number.");

        merchant.LegalName = req.LegalName.Trim();
        merchant.BrandName = NullIfBlank(req.BrandName);
        merchant.Email = email;
        merchant.MobileE164 = (req.MobileE164 ?? "").Trim();
        merchant.Gstin = NullIfBlank(req.Gstin);
        merchant.Mcc = string.IsNullOrWhiteSpace(req.Mcc) ? merchant.Mcc : req.Mcc.Trim();
        merchant.WebsiteUrl = (req.WebsiteUrl ?? "").Trim();
        merchant.PlatformFeePercent = fee;
        merchant.UpdatedAt = DateTimeOffset.UtcNow;
        if (pan.Length >= 10)
            merchant.PanMasked = $"{pan[..5]}****{pan[^1]}";
        if (ifsc.Length == 11)
            merchant.SettlementIfsc = ifsc;
        if (account.Length >= 4)
            merchant.SettlementAccountLast4 = account[^4..];
        if (!string.IsNullOrWhiteSpace(req.Password))
            merchant.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password.Trim());
        if (!string.IsNullOrWhiteSpace(req.Status) && Enum.TryParse<MerchantStatus>(req.Status, true, out var status))
            merchant.Status = status;

        var primary = await db.SettlementAccounts
            .FirstOrDefaultAsync(a => a.MerchantId == merchant.Id && a.IsDefault && a.CustomerId == null, ct);
        if (primary is not null)
        {
            primary.HolderName = merchant.LegalName;
            primary.Ifsc = merchant.SettlementIfsc;
            primary.AccountLast4 = merchant.SettlementAccountLast4;
        }

        db.AuditLogs.Add(new AuditLog
        {
            ActorType = "ADMIN",
            Action = "UPDATE_MERCHANT",
            EntityType = "Merchant",
            EntityId = merchant.Id
        });
        await db.SaveChangesAsync(ct);
        return Ok(ToRow(merchant));
    }

    [HttpDelete("merchants/{merchantId:guid}")]
    public async Task<IActionResult> DeleteMerchant(Guid merchantId, CancellationToken ct)
    {
        var merchant = await db.Merchants.FirstOrDefaultAsync(m => m.Id == merchantId, ct);
        if (merchant is null) return NotFound();

        var orderIds = await db.Orders.Where(o => o.MerchantId == merchantId).Select(o => o.Id).ToListAsync(ct);
        var txnIds = orderIds.Count == 0
            ? new List<Guid>()
            : await db.Transactions.Where(t => orderIds.Contains(t.OrderId)).Select(t => t.Id).ToListAsync(ct);

        var refunds = txnIds.Count == 0
            ? await db.Refunds.Where(r => r.MerchantId == merchantId).ToListAsync(ct)
            : await db.Refunds.Where(r => r.MerchantId == merchantId || txnIds.Contains(r.TransactionId)).ToListAsync(ct);
        db.Refunds.RemoveRange(refunds);
        if (txnIds.Count > 0)
            db.Transactions.RemoveRange(await db.Transactions.Where(t => txnIds.Contains(t.Id)).ToListAsync(ct));
        db.Orders.RemoveRange(await db.Orders.Where(o => o.MerchantId == merchantId).ToListAsync(ct));
        db.CommissionInvoices.RemoveRange(await db.CommissionInvoices.Where(i => i.MerchantId == merchantId).ToListAsync(ct));
        db.SettlementAccounts.RemoveRange(await db.SettlementAccounts.Where(a => a.MerchantId == merchantId).ToListAsync(ct));
        db.Customers.RemoveRange(await db.Customers.Where(c => c.MerchantId == merchantId).ToListAsync(ct));
        db.Merchants.Remove(merchant);
        db.AuditLogs.Add(new AuditLog
        {
            ActorType = "ADMIN",
            Action = "DELETE_MERCHANT",
            EntityType = "Merchant",
            EntityId = merchantId
        });
        await db.SaveChangesAsync(ct);
        return Ok(new { merchantId });
    }

    [HttpPost("merchants/{merchantId:guid}/freeze")]
    public async Task<IActionResult> Freeze(Guid merchantId, [FromBody] FreezeMerchantRequest req, CancellationToken ct)
    {
        var m = await db.Merchants.FirstOrDefaultAsync(x => x.Id == merchantId, ct);
        if (m is null) return NotFound();
        m.Status = MerchantStatus.Frozen;
        m.UpdatedAt = DateTimeOffset.UtcNow;
        db.AuditLogs.Add(new AuditLog
        {
            ActorType = "ADMIN",
            Action = "FREEZE_MERCHANT",
            EntityType = "Merchant",
            EntityId = merchantId,
            DetailsJson = $"{{\"reason\":\"{req.Reason}\"}}"
        });
        await db.SaveChangesAsync(ct);
        return Ok(new { merchantId, status = m.Status.ToString() });
    }

    [HttpPost("merchants/{merchantId:guid}/unfreeze")]
    public async Task<IActionResult> Unfreeze(Guid merchantId, CancellationToken ct)
    {
        var m = await db.Merchants.FirstOrDefaultAsync(x => x.Id == merchantId, ct);
        if (m is null) return NotFound();
        m.Status = MerchantStatus.Active;
        m.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { merchantId, status = m.Status.ToString() });
    }

    [HttpPost("merchants/{merchantId:guid}/invoices/weekly")]
    public async Task<ActionResult<CommissionInvoiceDto>> IssueInvoice(Guid merchantId, CancellationToken ct)
    {
        try
        {
            return Ok(await payments.IssueWeeklyInvoiceAsync(merchantId, ct));
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }

    [HttpGet("merchants/{merchantId:guid}/invoices")]
    public async Task<ActionResult<object>> Invoices(Guid merchantId, CancellationToken ct)
    {
        var rows = await db.CommissionInvoices.Where(i => i.MerchantId == merchantId)
            .OrderByDescending(i => i.IssuedAt)
            .Select(i => new
            {
                i.Id,
                i.InvoiceNumber,
                i.PlatformFeePaise,
                i.GstPaise,
                i.TotalPaise,
                Status = i.Status.ToString(),
                i.RemitToNote,
                i.IssuedAt
            })
            .ToListAsync(ct);
        return Ok(new { data = rows });
    }

    private ActionResult Validation(string message) =>
        BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", message, HttpContext.TraceIdentifier)));

    private static string? FeeError(decimal? requested, out decimal fee)
    {
        fee = requested ?? 0.25m;
        if (fee < 0 || fee > 100)
        {
            fee = 0;
            return "Fee percent must be between 0 and 100.";
        }
        return null;
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static object ToRow(Merchant m) => new
    {
        m.Id,
        m.LegalName,
        m.BrandName,
        m.Email,
        m.MobileE164,
        m.PanMasked,
        m.Gstin,
        m.Mcc,
        m.WebsiteUrl,
        m.SettlementIfsc,
        m.SettlementAccountLast4,
        Status = m.Status.ToString(),
        m.PlatformFeePercent,
        m.CreatedAt
    };
}
