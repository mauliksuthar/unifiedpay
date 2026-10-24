using System.Security.Cryptography;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UnifiedPay.Api.Data;
using UnifiedPay.Api.Domain;
using UnifiedPay.Api.Dtos;
using UnifiedPay.Api.Security;

namespace UnifiedPay.Api.Controllers;

[ApiController]
[Route("v1/auth")]
public class AuthController(AppDbContext db, JwtTokenService jwt) : ControllerBase
{
    [HttpPost("merchant/register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] MerchantRegisterRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(Error("VALIDATION_ERROR", "Email and password are required."));

        if (await db.Merchants.AnyAsync(m => m.Email == req.Email.Trim().ToLowerInvariant(), ct))
            return Conflict(Error("DUPLICATE_ORDER", "Email already registered."));

        var pan = req.Pan?.Trim().ToUpperInvariant() ?? "";
        if (pan.Length < 10)
            return BadRequest(Error("VALIDATION_ERROR", "Valid PAN is required for merchant KYC."));

        var acct = req.SettlementAccountNumber?.Trim() ?? "";
        if (acct.Length < 4)
            return BadRequest(Error("VALIDATION_ERROR", "Settlement account number is required."));

        var apiKey = $"up_live_{Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant()}";
        var apiSecret = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

        var merchant = new Merchant
        {
            LegalName = req.LegalName.Trim(),
            BrandName = req.BrandName?.Trim(),
            Email = req.Email.Trim().ToLowerInvariant(),
            MobileE164 = req.MobileE164.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            PanMasked = $"{pan[..5]}****{pan[^1]}",
            Gstin = req.Gstin,
            Mcc = string.IsNullOrWhiteSpace(req.Mcc) ? "5411" : req.Mcc,
            WebsiteUrl = req.WebsiteUrl,
            SettlementIfsc = req.SettlementIfsc.Trim().ToUpperInvariant(),
            SettlementAccountLast4 = acct[^4..],
            Status = MerchantStatus.Onboarding,
            ApiKey = apiKey,
            ApiSecretHash = BCrypt.Net.BCrypt.HashPassword(apiSecret),
            PlatformFeePercent = 0.25m
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
            ActorType = "MERCHANT",
            ActorId = merchant.Id,
            Action = "REGISTER",
            EntityType = "Merchant",
            EntityId = merchant.Id
        });
        await db.SaveChangesAsync(ct);

        // Phase 1 demo: auto-activate after KYC fields captured (replace with ops review later).
        merchant.Status = MerchantStatus.Active;
        await db.SaveChangesAsync(ct);

        var (token, expires) = jwt.CreateMerchantToken(merchant);
        Response.Headers.Append("X-UP-Api-Secret-Once", apiSecret);
        return Ok(new AuthResponse(token, expires, merchant.Id, merchant.ApiKey, merchant.Status.ToString()));
    }

    [HttpPost("merchant/login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] MerchantLoginRequest req, CancellationToken ct)
    {
        var merchant = await db.Merchants.FirstOrDefaultAsync(m => m.Email == req.Email.Trim().ToLowerInvariant(), ct);
        if (merchant is null || !BCrypt.Net.BCrypt.Verify(req.Password, merchant.PasswordHash))
            return Unauthorized(Error("UNAUTHORIZED", "Invalid email or password."));

        var (token, expires) = jwt.CreateMerchantToken(merchant);
        return Ok(new AuthResponse(token, expires, merchant.Id, merchant.ApiKey, merchant.Status.ToString()));
    }

    [HttpPost("admin/login")]
    public ActionResult<object> AdminLogin([FromBody] MerchantLoginRequest req)
    {
        var user = HttpContext.RequestServices.GetRequiredService<IConfiguration>()["Admin:Email"] ?? "admin@unifiedpay.local";
        var pass = HttpContext.RequestServices.GetRequiredService<IConfiguration>()["Admin:Password"] ?? "ChangeMeAdmin!23";
        if (!string.Equals(req.Email, user, StringComparison.OrdinalIgnoreCase) || req.Password != pass)
            return Unauthorized(Error("UNAUTHORIZED", "Invalid admin credentials."));

        var (token, expires) = jwt.CreateAdminToken();
        return Ok(new { access_token = token, expires_in = expires, role = "Admin" });
    }

    private ErrorResponse Error(string code, string message) =>
        new(new ApiError(code, message, HttpContext.TraceIdentifier));
}
