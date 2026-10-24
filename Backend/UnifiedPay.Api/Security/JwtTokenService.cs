using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using UnifiedPay.Api.Domain;

namespace UnifiedPay.Api.Security;

public class JwtTokenService(IConfiguration config)
{
    public (string Token, int ExpiresIn) CreateMerchantToken(Merchant merchant)
    {
        var key = config["Jwt:Key"] ?? "UnifiedPay-Phase1-Dev-Key-Change-In-Production-32chars!";
        var expiresIn = int.TryParse(config["Jwt:ExpiresMinutes"], out var m) ? m * 60 : 900;
        var expires = DateTime.UtcNow.AddSeconds(expiresIn);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, merchant.Id.ToString()),
            new Claim("merchant_id", merchant.Id.ToString()),
            new Claim(ClaimTypes.Email, merchant.Email),
            new Claim(ClaimTypes.Role, "Merchant"),
            new Claim("status", merchant.Status.ToString())
        };

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"] ?? "unifiedpay",
            audience: config["Jwt:Audience"] ?? "unifiedpay",
            claims: claims,
            expires: expires,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresIn);
    }

    public (string Token, int ExpiresIn) CreateAdminToken()
    {
        var key = config["Jwt:Key"] ?? "UnifiedPay-Phase1-Dev-Key-Change-In-Production-32chars!";
        var expiresIn = 3600;
        var expires = DateTime.UtcNow.AddSeconds(expiresIn);
        var claims = new[]
        {
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(JwtRegisteredClaimNames.Sub, "admin")
        };
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"] ?? "unifiedpay",
            audience: config["Jwt:Audience"] ?? "unifiedpay",
            claims: claims,
            expires: expires,
            signingCredentials: creds);
        return (new JwtSecurityTokenHandler().WriteToken(token), expiresIn);
    }
}
