using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace UnifiedPay.Api.Controllers;

[ApiController]
[Route("api")]
public class RazorpayController(IHttpClientFactory httpClientFactory, IConfiguration config) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("create-order")]
    public async Task<IActionResult> CreateOrder([FromBody] CreateRazorpayOrderRequest? req, CancellationToken ct)
    {
        if (req is null || req.Amount < 100)
            return BadRequest(new { error = new { message = "Minimum amount is 100 paise." } });

        var keyId = config["RAZORPAY_KEY_ID"];
        var keySecret = config["RAZORPAY_KEY_SECRET"];
        if (string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(keySecret))
            return StatusCode(500, new { error = new { message = "Razorpay keys are not configured." } });

        var currency = string.IsNullOrWhiteSpace(req.Currency) ? "INR" : req.Currency.Trim().ToUpperInvariant();
        var receipt = string.IsNullOrWhiteSpace(req.Receipt) ? $"rcpt_{Guid.NewGuid():N}"[..20] : req.Receipt.Trim();

        var payload = JsonSerializer.Serialize(new { amount = req.Amount, currency, receipt });
        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.razorpay.com/v1/orders")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{keyId}:{keySecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        var client = httpClientFactory.CreateClient();
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = new { message = "Razorpay request failed.", detail = ex.Message } });
        }

        var body = await response.Content.ReadAsStringAsync(ct);
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            return StatusCode(502, new { error = new { message = "Razorpay rejected the API keys. Check the key id and secret, then try again." } });

        if (!response.IsSuccessStatusCode)
            return StatusCode(500, new { error = new { message = "Razorpay order creation failed.", detail = body } });

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        return Ok(new
        {
            order_id = root.GetProperty("id").GetString(),
            amount = root.GetProperty("amount").GetInt64(),
            currency = root.GetProperty("currency").GetString()
        });
    }

    [AllowAnonymous]
    [HttpPost("verify-payment")]
    public IActionResult VerifyPayment([FromBody] VerifyRazorpayPaymentRequest? req)
    {
        if (req is null
            || string.IsNullOrWhiteSpace(req.RazorpayOrderId)
            || string.IsNullOrWhiteSpace(req.RazorpayPaymentId)
            || string.IsNullOrWhiteSpace(req.RazorpaySignature))
            return BadRequest(new { error = new { message = "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required." } });

        var keySecret = config["RAZORPAY_KEY_SECRET"];
        if (string.IsNullOrWhiteSpace(keySecret))
            return StatusCode(500, new { error = new { message = "Razorpay keys are not configured." } });

        var payload = $"{req.RazorpayOrderId}|{req.RazorpayPaymentId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(keySecret));
        var generated = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();

        var provided = Encoding.UTF8.GetBytes(req.RazorpaySignature.Trim().ToLowerInvariant());
        var expected = Encoding.UTF8.GetBytes(generated);
        if (provided.Length != expected.Length || !CryptographicOperations.FixedTimeEquals(expected, provided))
            return BadRequest(new { error = new { message = "Payment signature mismatch." }, paid = false });

        return Ok(new
        {
            success = true,
            paid = true,
            razorpay_order_id = req.RazorpayOrderId,
            razorpay_payment_id = req.RazorpayPaymentId
        });
    }
}

public record CreateRazorpayOrderRequest(long Amount, string? Currency, string? Receipt);

public class VerifyRazorpayPaymentRequest
{
    [JsonPropertyName("razorpay_order_id")]
    public string? RazorpayOrderId { get; set; }

    [JsonPropertyName("razorpay_payment_id")]
    public string? RazorpayPaymentId { get; set; }

    [JsonPropertyName("razorpay_signature")]
    public string? RazorpaySignature { get; set; }
}
