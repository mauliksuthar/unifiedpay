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
                m.Email,
                Status = m.Status.ToString(),
                m.PlatformFeePercent,
                m.CreatedAt
            })
            .ToListAsync(ct);
        return Ok(new { data = rows });
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
}
