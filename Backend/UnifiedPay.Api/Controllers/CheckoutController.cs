using Microsoft.AspNetCore.Mvc;
using UnifiedPay.Api.Services;

namespace UnifiedPay.Api.Controllers;

[ApiController]
[Route("v1/checkout")]
public class CheckoutController(PaymentOrchestrationService payments, IConfiguration config) : ControllerBase
{
    /// <summary>
    /// Mock hosted checkout page (simulates PG redirect). No PAN fields — Phase 1 PCI posture.
    /// </summary>
    [HttpGet("mock")]
    public ContentResult MockPage([FromQuery] Guid paymentId, [FromQuery] string pspRef, [FromQuery] long amount, [FromQuery] string? returnUrl)
    {
        var frontend = config["App:FrontendBaseUrl"] ?? "http://localhost:3000";
        var rupees = amount / 100.0;
        var html = $$"""
            <!DOCTYPE html>
            <html><head><meta charset="utf-8"/><title>UnifiedPay Mock Card Checkout</title>
            <style>
              body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:24px;background:#f6f7f9}
              .card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
              button{width:100%;padding:12px;margin-top:12px;border:0;border-radius:8px;font-weight:600;cursor:pointer}
              .ok{background:#0b6e4f;color:#fff}.fail{background:#fff;border:1px solid #ccc}
              .note{font-size:12px;color:#666;margin-top:16px}
            </style></head><body><div class="card">
            <h2>Mock PG Checkout</h2>
            <p>Amount: <strong>₹{{rupees:F2}}</strong></p>
            <p>Payment: <code>{{paymentId}}</code></p>
            <p>PSP Ref: <code>{{pspRef}}</code></p>
            <p class="note">Phase 1 demo only. Real card data is never collected here. Licensed PG will settle to the merchant bank; UnifiedPay only earns commission by invoice.</p>
            <form method="post" action="/v1/checkout/mock/complete">
              <input type="hidden" name="paymentId" value="{{paymentId}}"/>
              <input type="hidden" name="returnUrl" value="{{returnUrl}}"/>
              <button class="ok" name="success" value="true" type="submit">Simulate SUCCESS</button>
              <button class="fail" name="success" value="false" type="submit">Simulate FAIL</button>
            </form>
            <p class="note">After pay you can return to <a href="{{frontend}}/checkout/{{paymentId}}/status">status page</a>.</p>
            </div></body></html>
            """;
        return Content(html, "text/html");
    }

    [HttpPost("mock/complete")]
    public async Task<IActionResult> Complete(
        [FromForm] Guid paymentId,
        [FromForm] bool success,
        [FromForm] string? returnUrl,
        CancellationToken ct)
    {
        try
        {
            await payments.CompleteMockCheckoutAsync(paymentId, success, ct);
        }
        catch (ApiException ex)
        {
            return BadRequest(ex.Message);
        }

        if (!string.IsNullOrWhiteSpace(returnUrl))
            return Redirect(returnUrl);

        var frontend = config["App:FrontendBaseUrl"] ?? "http://localhost:3000";
        return Redirect($"{frontend}/checkout/{paymentId}/status");
    }
}
