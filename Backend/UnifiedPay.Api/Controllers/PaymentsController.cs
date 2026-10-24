using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using UnifiedPay.Api.Dtos;
using UnifiedPay.Api.Services;

namespace UnifiedPay.Api.Controllers;

[ApiController]
[Route("v1")]
public class PaymentsController(PaymentOrchestrationService payments) : ControllerBase
{
    [HttpGet("payments/{paymentId:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<PaymentDto>> Get(Guid paymentId, CancellationToken ct)
    {
        try
        {
            return Ok(await payments.GetPaymentAsync(paymentId, ct));
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }

    [HttpPost("payments/{paymentId:guid}/refunds")]
    [Authorize(Roles = "Merchant")]
    public async Task<ActionResult<RefundDto>> Refund(
        Guid paymentId,
        [FromBody] CreateRefundRequest req,
        CancellationToken ct)
    {
        try
        {
            var key = Request.Headers["Idempotency-Key"].FirstOrDefault() ?? Guid.NewGuid().ToString("N");
            var merchantId = Guid.Parse(User.FindFirstValue("merchant_id")!);
            return Ok(await payments.RefundAsync(merchantId, paymentId, req, key, ct));
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }

    /// <summary>PG webhook ingest (Phase 1: mock + future Razorpay/Cashfree).</summary>
    [HttpPost("webhooks/payments")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook([FromBody] WebhookPayload payload, CancellationToken ct)
    {
        try
        {
            await payments.HandleWebhookAsync(payload, ct);
            return Ok(new { received = true });
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }
}
