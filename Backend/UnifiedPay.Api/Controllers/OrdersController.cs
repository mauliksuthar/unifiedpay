using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UnifiedPay.Api.Data;
using UnifiedPay.Api.Dtos;
using UnifiedPay.Api.Services;

namespace UnifiedPay.Api.Controllers;

[ApiController]
[Route("v1")]
[Authorize(Roles = "Merchant")]
public class OrdersController(PaymentOrchestrationService payments, AppDbContext db) : ControllerBase
{
    [HttpPost("orders")]
    public async Task<ActionResult<OrderDto>> Create([FromBody] CreateOrderRequest req, CancellationToken ct)
    {
        try
        {
            var order = await payments.CreateOrderAsync(GetMerchantId(), req, ct);
            return Ok(order);
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }

    [HttpGet("orders")]
    public async Task<ActionResult<object>> List(CancellationToken ct)
    {
        var merchantId = GetMerchantId();
        var rows = await db.Orders.Where(o => o.MerchantId == merchantId)
            .OrderByDescending(o => o.CreatedAt)
            .Take(50)
            .Select(o => new
            {
                o.Id,
                o.MerchantOrderRef,
                o.AmountPaise,
                o.Currency,
                Status = o.Status.ToString(),
                o.CreatedAt
            })
            .ToListAsync(ct);
        return Ok(new { data = rows });
    }

    [HttpGet("orders/{orderId:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<object>> Get(Guid orderId, CancellationToken ct)
    {
        var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null) return NotFound();
        return Ok(new
        {
            order.Id,
            order.MerchantOrderRef,
            order.AmountPaise,
            order.Currency,
            Status = order.Status.ToString(),
            order.CustomerEmail,
            order.ReturnUrl,
            order.CreatedAt
        });
    }

    [HttpPost("orders/{orderId:guid}/payments")]
    public async Task<ActionResult<PaymentDto>> Pay(
        Guid orderId,
        [FromBody] CreatePaymentRequest? req,
        CancellationToken ct)
    {
        try
        {
            var key = Request.Headers["Idempotency-Key"].FirstOrDefault() ?? Guid.NewGuid().ToString("N");
            var payment = await payments.StartCardPaymentAsync(GetMerchantId(), orderId, key, ct);
            return Ok(payment);
        }
        catch (ApiException ex)
        {
            return StatusCode(ex.StatusCode, new ErrorResponse(new ApiError(ex.Code, ex.Message, HttpContext.TraceIdentifier)));
        }
    }

    private Guid GetMerchantId() =>
        Guid.Parse(User.FindFirstValue("merchant_id") ?? User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
