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

    [HttpGet("me/customers")]
    public async Task<ActionResult<object>> Customers([FromQuery] string? q, CancellationToken ct)
    {
        var id = GetMerchantId();
        var query = db.Customers.Where(c => c.MerchantId == id);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(c =>
                c.Name.Contains(term) ||
                (c.Mobile != null && c.Mobile.Contains(term)) ||
                (c.Email != null && c.Email.Contains(term)));
        }

        var rows = await query.OrderBy(c => c.Name).Take(200).ToListAsync(ct);
        var ids = rows.Select(c => c.Id).ToList();
        var accounts = ids.Count == 0
            ? new List<SettlementAccount>()
            : await db.SettlementAccounts
                .Where(a => a.CustomerId != null && ids.Contains(a.CustomerId.Value))
                .ToListAsync(ct);

        return Ok(new
        {
            data = rows.Select(c =>
            {
                var mine = accounts.Where(a => a.CustomerId == c.Id).ToList();
                var primary = mine.FirstOrDefault(a => a.IsDefault) ?? mine.FirstOrDefault();
                return new
                {
                    c.Id,
                    c.Name,
                    c.Mobile,
                    c.Email,
                    AccountCount = mine.Count,
                    PrimaryBank = primary?.BankName
                };
            })
        });
    }

    [HttpPost("me/customers")]
    public async Task<ActionResult<object>> AddCustomer([FromBody] CreateCustomerRequest req, CancellationToken ct)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length < 2)
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Enter the customer name.", HttpContext.TraceIdentifier)));

        var id = GetMerchantId();
        var mobile = string.IsNullOrWhiteSpace(req.Mobile) ? null : req.Mobile.Trim();
        var email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim();
        if (email is not null && !email.Contains('@'))
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Enter a valid email or leave it blank.", HttpContext.TraceIdentifier)));

        var exists = await db.Customers.AnyAsync(c => c.MerchantId == id && c.Name == name && c.Mobile == mobile, ct);
        if (exists)
            return Conflict(new ErrorResponse(new ApiError("DUPLICATE_ORDER", "This customer is already saved.", HttpContext.TraceIdentifier)));

        var row = new Customer
        {
            MerchantId = id,
            Name = name,
            Mobile = mobile,
            Email = email
        };
        db.Customers.Add(row);
        await db.SaveChangesAsync(ct);
        return Ok(new { row.Id, row.Name, row.Mobile, row.Email, AccountCount = 0, PrimaryBank = (string?)null });
    }

    [HttpGet("me/accounts")]
    public async Task<ActionResult<object>> Accounts([FromQuery] Guid? customerId, [FromQuery] string? q, CancellationToken ct)
    {
        var id = GetMerchantId();
        var query = db.SettlementAccounts.Where(a => a.MerchantId == id);
        if (customerId is Guid cid)
            query = query.Where(a => a.CustomerId == cid);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(a =>
                a.BankName.Contains(term) ||
                a.Label.Contains(term) ||
                a.Ifsc.Contains(term) ||
                a.HolderName.Contains(term) ||
                a.AccountLast4.Contains(term) ||
                (a.Customer != null && a.Customer.Name.Contains(term)));
        }

        var rows = await query
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
                a.IsDefault,
                a.IsFrozen,
                a.CustomerId,
                CustomerName = a.Customer != null ? a.Customer.Name : null
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
        if (string.IsNullOrWhiteSpace(req.BankName) || string.IsNullOrWhiteSpace(req.HolderName))
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Enter the bank name and account holder.", HttpContext.TraceIdentifier)));
        if (req.CustomerId is not Guid cid || cid == Guid.Empty)
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Choose a customer for this bank account.", HttpContext.TraceIdentifier)));

        var id = GetMerchantId();
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == cid && c.MerchantId == id, ct);
        if (customer is null)
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "That customer was not found.", HttpContext.TraceIdentifier)));

        var last4 = acct[^4..];
        var exists = await db.SettlementAccounts.AnyAsync(a => a.MerchantId == id && a.Ifsc == ifsc && a.AccountLast4 == last4, ct);
        if (exists)
            return Conflict(new ErrorResponse(new ApiError("DUPLICATE_ORDER", "This bank account is already saved.", HttpContext.TraceIdentifier)));

        var row = new SettlementAccount
        {
            MerchantId = id,
            CustomerId = customer.Id,
            Label = string.IsNullOrWhiteSpace(req.Label) ? req.BankName.Trim() : req.Label.Trim(),
            BankName = req.BankName.Trim(),
            HolderName = req.HolderName.Trim(),
            Ifsc = ifsc,
            AccountLast4 = last4,
            IsDefault = !await db.SettlementAccounts.AnyAsync(a => a.MerchantId == id && a.CustomerId == customer.Id, ct)
        };
        db.SettlementAccounts.Add(row);
        await db.SaveChangesAsync(ct);
        return Ok(new
        {
            row.Id,
            row.Label,
            row.BankName,
            row.HolderName,
            row.Ifsc,
            row.AccountLast4,
            row.IsDefault,
            row.IsFrozen,
            row.CustomerId,
            CustomerName = customer.Name
        });
    }

    [HttpPut("me/accounts/{accountId:guid}")]
    public async Task<ActionResult<object>> UpdateAccount(Guid accountId, [FromBody] UpdateSettlementAccountRequest req, CancellationToken ct)
    {
        var id = GetMerchantId();
        var row = await db.SettlementAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.MerchantId == id, ct);
        if (row is null) return NotFound();

        var ifsc = (req.Ifsc ?? "").Trim().ToUpperInvariant();
        if (ifsc.Length != 11)
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "IFSC must be 11 characters.", HttpContext.TraceIdentifier)));
        if (string.IsNullOrWhiteSpace(req.BankName) || string.IsNullOrWhiteSpace(req.HolderName))
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Enter the bank name and account holder.", HttpContext.TraceIdentifier)));

        var accountNumber = (req.AccountNumber ?? "").Trim();
        var last4 = row.AccountLast4;
        if (accountNumber.Length > 0)
        {
            if (accountNumber.Length < 6)
                return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Enter the full account number, or leave it blank to keep the saved one.", HttpContext.TraceIdentifier)));
            last4 = accountNumber[^4..];
        }

        Customer? customer = null;
        if (req.CustomerId is Guid cid && cid != Guid.Empty)
        {
            customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == cid && c.MerchantId == id, ct);
            if (customer is null)
                return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "That customer was not found.", HttpContext.TraceIdentifier)));
        }

        var duplicate = await db.SettlementAccounts.AnyAsync(
            a => a.MerchantId == id && a.Id != row.Id && a.Ifsc == ifsc && a.AccountLast4 == last4, ct);
        if (duplicate)
            return Conflict(new ErrorResponse(new ApiError("DUPLICATE_ORDER", "This bank account is already saved.", HttpContext.TraceIdentifier)));

        var oldCustomerId = row.CustomerId;
        var wasDefault = row.IsDefault;
        row.Label = string.IsNullOrWhiteSpace(req.Label) ? req.BankName.Trim() : req.Label.Trim();
        row.BankName = req.BankName.Trim();
        row.HolderName = req.HolderName.Trim();
        row.Ifsc = ifsc;
        row.AccountLast4 = last4;
        row.CustomerId = customer?.Id;

        if (oldCustomerId != row.CustomerId)
        {
            if (wasDefault)
            {
                row.IsDefault = false;
                await PromoteUnfrozen(id, oldCustomerId, row.Id, ct);
            }
            if (!row.IsFrozen && !await HasPrimary(id, row.CustomerId, row.Id, ct))
                row.IsDefault = true;
        }

        await db.SaveChangesAsync(ct);
        return Ok(AccountView(row, customer?.Name));
    }

    [HttpDelete("me/accounts/{accountId:guid}")]
    public async Task<IActionResult> DeleteAccount(Guid accountId, CancellationToken ct)
    {
        var id = GetMerchantId();
        var row = await db.SettlementAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.MerchantId == id, ct);
        if (row is null) return NotFound();
        if (row.IsDefault)
            await PromoteUnfrozen(id, row.CustomerId, row.Id, ct);
        db.SettlementAccounts.Remove(row);
        await db.SaveChangesAsync(ct);
        return Ok(new { accountId });
    }

    [HttpPost("me/accounts/{accountId:guid}/freeze")]
    public async Task<ActionResult<object>> FreezeAccount(Guid accountId, [FromBody] SetFrozenRequest req, CancellationToken ct)
    {
        var id = GetMerchantId();
        var row = await db.SettlementAccounts.Include(a => a.Customer).FirstOrDefaultAsync(a => a.Id == accountId && a.MerchantId == id, ct);
        if (row is null) return NotFound();

        row.IsFrozen = req.Frozen;
        if (row.IsFrozen && row.IsDefault)
        {
            row.IsDefault = false;
            await PromoteUnfrozen(id, row.CustomerId, row.Id, ct);
        }
        else if (!row.IsFrozen && !await HasPrimary(id, row.CustomerId, row.Id, ct))
        {
            row.IsDefault = true;
        }

        await db.SaveChangesAsync(ct);
        return Ok(AccountView(row, row.Customer?.Name));
    }

    [HttpPost("me/accounts/{accountId:guid}/primary")]
    public async Task<ActionResult<object>> MakePrimary(Guid accountId, CancellationToken ct)
    {
        var id = GetMerchantId();
        var row = await db.SettlementAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.MerchantId == id, ct);
        if (row is null) return NotFound();
        if (row.IsFrozen)
            return BadRequest(new ErrorResponse(new ApiError("VALIDATION_ERROR", "Unfreeze this account before making it primary.", HttpContext.TraceIdentifier)));

        var siblings = row.CustomerId is Guid cid
            ? await db.SettlementAccounts.Where(a => a.MerchantId == id && a.CustomerId == cid).ToListAsync(ct)
            : await db.SettlementAccounts.Where(a => a.MerchantId == id && a.CustomerId == null).ToListAsync(ct);
        foreach (var sibling in siblings)
            sibling.IsDefault = sibling.Id == row.Id;
        await db.SaveChangesAsync(ct);
        return Ok(new { row.Id, row.IsDefault });
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

    private async Task<bool> HasPrimary(Guid merchantId, Guid? customerId, Guid exceptId, CancellationToken ct)
    {
        return customerId is Guid cid
            ? await db.SettlementAccounts.AnyAsync(a => a.MerchantId == merchantId && a.CustomerId == cid && a.Id != exceptId && a.IsDefault && !a.IsFrozen, ct)
            : await db.SettlementAccounts.AnyAsync(a => a.MerchantId == merchantId && a.CustomerId == null && a.Id != exceptId && a.IsDefault && !a.IsFrozen, ct);
    }

    private async Task PromoteUnfrozen(Guid merchantId, Guid? customerId, Guid exceptId, CancellationToken ct)
    {
        var siblings = customerId is Guid cid
            ? await db.SettlementAccounts.Where(a => a.MerchantId == merchantId && a.CustomerId == cid && a.Id != exceptId && !a.IsFrozen).ToListAsync(ct)
            : await db.SettlementAccounts.Where(a => a.MerchantId == merchantId && a.CustomerId == null && a.Id != exceptId && !a.IsFrozen).ToListAsync(ct);
        if (siblings.Any(a => a.IsDefault)) return;
        var next = siblings.OrderBy(a => a.CreatedAt).FirstOrDefault();
        if (next is not null) next.IsDefault = true;
    }

    private static object AccountView(SettlementAccount row, string? customerName) => new
    {
        row.Id,
        row.Label,
        row.BankName,
        row.HolderName,
        row.Ifsc,
        row.AccountLast4,
        row.IsDefault,
        row.IsFrozen,
        row.CustomerId,
        CustomerName = customerName
    };

    private Guid GetMerchantId() =>
        Guid.Parse(User.FindFirstValue("merchant_id") ?? User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static MerchantDto ToDto(Merchant m) => new(
        m.Id, m.LegalName, m.BrandName, m.Email, m.MobileE164, m.PanMasked, m.Gstin, m.Mcc,
        m.WebsiteUrl, m.SettlementIfsc, m.SettlementAccountLast4, m.Status.ToString(), m.ApiKey, m.PlatformFeePercent);
}
