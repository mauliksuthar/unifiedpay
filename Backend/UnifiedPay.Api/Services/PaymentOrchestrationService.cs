using Microsoft.EntityFrameworkCore;
using UnifiedPay.Api.Data;
using UnifiedPay.Api.Domain;
using UnifiedPay.Api.Dtos;
using UnifiedPay.Api.Services.Payments;

namespace UnifiedPay.Api.Services;

public class PaymentOrchestrationService(
    AppDbContext db,
    IPaymentGateway gateway,
    IConfiguration config)
{
    public async Task<OrderDto> CreateOrderAsync(Guid merchantId, CreateOrderRequest req, CancellationToken ct)
    {
        if (req.AmountPaise < 100)
            throw new ApiException(400, "VALIDATION_ERROR", "Minimum amount is 100 paise (₹1).");

        var merchant = await db.Merchants.FirstOrDefaultAsync(m => m.Id == merchantId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Merchant not found.");

        if (merchant.Status == MerchantStatus.Frozen)
            throw new ApiException(403, "FORBIDDEN", "Merchant is frozen.");

        if (merchant.Status == MerchantStatus.Onboarding)
            throw new ApiException(422, "KYC_REQUIRED", "Complete merchant KYC / activation before collecting.");

        var exists = await db.Orders.AnyAsync(
            o => o.MerchantId == merchantId && o.MerchantOrderRef == req.MerchantOrderRef, ct);
        if (exists)
            throw new ApiException(409, "DUPLICATE_ORDER", "merchant_order_ref already exists.");

        var order = new Order
        {
            MerchantId = merchantId,
            MerchantOrderRef = req.MerchantOrderRef,
            AmountPaise = req.AmountPaise,
            Currency = string.IsNullOrWhiteSpace(req.Currency) ? "INR" : req.Currency,
            CustomerMobile = req.CustomerMobile,
            CustomerEmail = req.CustomerEmail,
            ReturnUrl = req.ReturnUrl,
            Status = OrderStatus.Created
        };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var frontend = config["App:FrontendBaseUrl"] ?? "http://localhost:3000";
        return ToOrderDto(order, $"{frontend}/checkout/{order.Id}");
    }

    public async Task<PaymentDto> StartCardPaymentAsync(
        Guid merchantId,
        Guid orderId,
        string idempotencyKey,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new ApiException(400, "VALIDATION_ERROR", "Idempotency-Key header is required.");

        var existing = await db.Transactions.FirstOrDefaultAsync(t => t.IdempotencyKey == idempotencyKey, ct);
        if (existing != null)
            return ToPaymentDto(existing);

        var order = await db.Orders.Include(o => o.Merchant)
            .FirstOrDefaultAsync(o => o.Id == orderId && o.MerchantId == merchantId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Order not found.");

        if (order.Merchant.Status != MerchantStatus.Active)
            throw new ApiException(403, "FORBIDDEN", "Merchant must be Active to collect.");

        if (order.Status == OrderStatus.Paid)
            throw new ApiException(409, "DUPLICATE_ORDER", "Order already paid.");

        var txn = new PaymentTransaction
        {
            OrderId = order.Id,
            Rail = "CREDIT",
            GatewayCode = gateway.GatewayCode,
            AmountPaise = order.AmountPaise,
            Status = PaymentStatus.Initiated,
            IdempotencyKey = idempotencyKey
        };
        db.Transactions.Add(txn);
        await db.SaveChangesAsync(ct);

        var pg = await gateway.CreateCardCheckoutAsync(
            txn.Id,
            txn.AmountPaise,
            order.Currency,
            order.CustomerEmail,
            order.ReturnUrl,
            ct);

        txn.PspRef = pg.PspRef;
        txn.CheckoutUrl = pg.CheckoutUrl;
        txn.GatewayCode = pg.GatewayCode;
        txn.Status = PaymentStatus.Pending;
        order.Status = OrderStatus.Pending;
        order.UpdatedAt = DateTimeOffset.UtcNow;
        txn.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        await AuditAsync("SYSTEM", null, "PAYMENT_STARTED", "PaymentTransaction", txn.Id,
            $"{{\"gateway\":\"{pg.GatewayCode}\",\"rail\":\"CREDIT\"}}", ct);

        return ToPaymentDto(txn);
    }

    public async Task<PaymentDto> GetPaymentAsync(Guid paymentId, CancellationToken ct)
    {
        var txn = await db.Transactions.FirstOrDefaultAsync(t => t.Id == paymentId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Payment not found.");
        return ToPaymentDto(txn);
    }

    public async Task HandleWebhookAsync(WebhookPayload payload, CancellationToken ct)
    {
        var txn = await db.Transactions.Include(t => t.Order)
            .FirstOrDefaultAsync(t => t.PspRef == payload.PspRef, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Unknown psp_ref.");

        if (txn.Status is PaymentStatus.Success or PaymentStatus.Failed)
            return;

        if (payload.Status.Equals("SUCCESS", StringComparison.OrdinalIgnoreCase))
        {
            txn.Status = PaymentStatus.Success;
            txn.Utr = payload.Utr ?? $"UTR{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
            txn.Order.Status = OrderStatus.Paid;
            txn.SettlementStatus = "CREDITED_TO_MERCHANT_BANK";
            ApplyFee(txn);
            // IMPORTANT: settlement is by the licensed PG to merchant bank — UnifiedPay does not move funds.
        }
        else
        {
            txn.Status = PaymentStatus.Failed;
            txn.FailureCode = payload.FailureCode ?? "DECLINED";
            txn.FailureMessage = "Issuer or gateway declined the card payment. No amount was credited to the bank.";
            txn.SettlementStatus = "NOT_SETTLED";
            txn.Order.Status = OrderStatus.Failed;
        }

        txn.UpdatedAt = DateTimeOffset.UtcNow;
        txn.Order.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        await AuditAsync("SYSTEM", null, "WEBHOOK_" + payload.Status, "PaymentTransaction", txn.Id, null, ct);
    }

    public async Task CompleteMockCheckoutAsync(Guid paymentId, bool success, CancellationToken ct)
    {
        var txn = await db.Transactions.FirstOrDefaultAsync(t => t.Id == paymentId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Payment not found.");

        await HandleWebhookAsync(new WebhookPayload(
            "payment.captured",
            txn.PspRef ?? "",
            success ? "SUCCESS" : "FAILED",
            success ? $"MOCKUTR{Random.Shared.Next(100000, 999999)}" : null,
            success ? null : "05"), ct);
    }

    public async Task<RefundDto> RefundAsync(
        Guid merchantId,
        Guid paymentId,
        CreateRefundRequest req,
        string idempotencyKey,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new ApiException(400, "VALIDATION_ERROR", "Idempotency-Key header is required.");

        var existing = await db.Refunds.FirstOrDefaultAsync(r => r.IdempotencyKey == idempotencyKey, ct);
        if (existing != null)
            return new RefundDto(existing.Id, existing.TransactionId, existing.AmountPaise, existing.Status, existing.PspRefundRef);

        var txn = await db.Transactions.Include(t => t.Order)
            .FirstOrDefaultAsync(t => t.Id == paymentId && t.Order.MerchantId == merchantId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Payment not found.");

        if (txn.Status != PaymentStatus.Success)
            throw new ApiException(422, "PAYMENT_DECLINED", "Only successful payments can be refunded.");

        var refunded = await db.Refunds.Where(r => r.TransactionId == paymentId && r.Status != "FAILED")
            .SumAsync(r => r.AmountPaise, ct);
        if (req.AmountPaise <= 0 || refunded + req.AmountPaise > txn.AmountPaise)
            throw new ApiException(400, "VALIDATION_ERROR", "Invalid refund amount.");

        var pgRefund = await gateway.RefundAsync(txn.PspRef!, req.AmountPaise, ct);
        var refund = new Refund
        {
            TransactionId = txn.Id,
            MerchantId = merchantId,
            AmountPaise = req.AmountPaise,
            Reason = req.Reason,
            Status = pgRefund.Status,
            IdempotencyKey = idempotencyKey,
            PspRefundRef = pgRefund.PspRefundRef
        };
        db.Refunds.Add(refund);
        await db.SaveChangesAsync(ct);
        return new RefundDto(refund.Id, refund.TransactionId, refund.AmountPaise, refund.Status, refund.PspRefundRef);
    }

    public async Task<PaymentDto> TransferCardToBankAsync(Guid merchantId, CardToBankRequest req, CancellationToken ct)
    {
        if (req.CardLast4 is null || req.CardLast4.Length != 4 || !req.CardLast4.All(char.IsDigit))
            throw new ApiException(400, "VALIDATION_ERROR", "Send only the last 4 digits. Full card number and CVV are not accepted.");

        var merchant = await db.Merchants.FirstOrDefaultAsync(m => m.Id == merchantId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Merchant not found.");
        if (merchant.Status != MerchantStatus.Active)
            throw new ApiException(403, "FORBIDDEN", "Merchant must be Active.");
        if (req.AmountPaise < 100)
            throw new ApiException(400, "VALIDATION_ERROR", "Minimum amount is ₹1.");
        if (req.SettlementAccountId == Guid.Empty)
            throw new ApiException(400, "VALIDATION_ERROR", "Choose which bank account should receive this transfer.");

        var account = await db.SettlementAccounts
            .FirstOrDefaultAsync(a => a.Id == req.SettlementAccountId && a.MerchantId == merchantId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Selected bank account was not found.");

        var order = new Order
        {
            MerchantId = merchantId,
            MerchantOrderRef = $"CARD-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(100, 999)}",
            AmountPaise = req.AmountPaise,
            Currency = "INR",
            CustomerEmail = req.CustomerEmail,
            CustomerMobile = req.CustomerMobile,
            Status = OrderStatus.Pending
        };
        var txn = new PaymentTransaction
        {
            Order = order,
            Rail = "CREDIT",
            GatewayCode = gateway.GatewayCode,
            AmountPaise = req.AmountPaise,
            Status = PaymentStatus.Pending,
            IdempotencyKey = Guid.NewGuid().ToString("N"),
            CardHolderName = req.CardHolderName.Trim(),
            CardBrand = req.CardBrand.Trim().ToUpperInvariant(),
            CardLast4 = req.CardLast4,
            CardExpiry = req.CardExpiry.Trim(),
            BankIfsc = account.Ifsc,
            BankAccountLast4 = account.AccountLast4,
            BankBeneficiary = $"{account.HolderName} · {account.BankName} ({account.Label})",
            SettlementStatus = "SENT_TO_GATEWAY"
        };
        txn.PspRef = $"pay_mock_{txn.Id:N}"[..28];
        db.Orders.Add(order);
        db.Transactions.Add(txn);
        await db.SaveChangesAsync(ct);

        var forceFail = req.CardLast4 == "0002";
        await CompleteMockCheckoutAsync(txn.Id, !forceFail, ct);
        var saved = await db.Transactions.FirstAsync(t => t.Id == txn.Id, ct);
        return ToPaymentDto(saved);
    }

    public async Task<RefundDto> ReverseAsync(Guid merchantId, Guid paymentId, string? reason, CancellationToken ct)
    {
        var txn = await db.Transactions.Include(t => t.Order)
            .FirstOrDefaultAsync(t => t.Id == paymentId && t.Order.MerchantId == merchantId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Payment not found.");
        if (txn.Status != PaymentStatus.Success)
            throw new ApiException(422, "PAYMENT_DECLINED", "Only a successful card payment can be reversed.");

        var refund = new Refund
        {
            TransactionId = txn.Id,
            MerchantId = merchantId,
            AmountPaise = txn.AmountPaise,
            Reason = string.IsNullOrWhiteSpace(reason) ? "MERCHANT_REVERSAL" : reason,
            Status = "SUCCESS",
            IdempotencyKey = Guid.NewGuid().ToString("N"),
            PspRefundRef = $"rvsl_{Guid.NewGuid():N}"[..20]
        };
        txn.Status = PaymentStatus.Reversed;
        txn.SettlementStatus = "REVERSED_TO_CARD";
        txn.Order.Status = OrderStatus.Cancelled;
        txn.UpdatedAt = DateTimeOffset.UtcNow;
        db.Refunds.Add(refund);
        await db.SaveChangesAsync(ct);
        return new RefundDto(refund.Id, refund.TransactionId, refund.AmountPaise, refund.Status, refund.PspRefundRef);
    }

    private static void ApplyFee(PaymentTransaction txn)
    {
        txn.FeePaise = (long)Math.Round(txn.AmountPaise * 0.0025, MidpointRounding.AwayFromZero);
        var pgMdr = (long)Math.Round(txn.AmountPaise * 0.02, MidpointRounding.AwayFromZero);
        txn.NetPaise = txn.AmountPaise - pgMdr;
    }

    public async Task<CommissionInvoiceDto> IssueWeeklyInvoiceAsync(Guid merchantId, CancellationToken ct)
    {
        var merchant = await db.Merchants.FirstOrDefaultAsync(m => m.Id == merchantId, ct)
            ?? throw new ApiException(404, "NOT_FOUND", "Merchant not found.");

        var to = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = to.AddDays(-7);

        var successPaise = await db.Transactions
            .Where(t => t.Order.MerchantId == merchantId
                        && t.Status == PaymentStatus.Success
                        && t.CreatedAt >= from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)
                        && t.CreatedAt < to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc))
            .SumAsync(t => (long?)t.AmountPaise, ct) ?? 0;

        var fee = (long)Math.Round(successPaise * (double)(merchant.PlatformFeePercent / 100m), MidpointRounding.AwayFromZero);
        var gst = (long)Math.Round(fee * 0.18, MidpointRounding.AwayFromZero);

        var invoice = new CommissionInvoice
        {
            MerchantId = merchantId,
            InvoiceNumber = $"UP-INV-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(1000, 9999)}",
            PeriodFrom = from,
            PeriodTo = to,
            GrossSuccessPaise = successPaise,
            PlatformFeePaise = fee,
            GstPaise = gst,
            TotalPaise = fee + gst,
            Status = InvoiceStatus.Issued,
            RemitToNote = "Pay to UnifiedPay fee/commission bank account only. Customer card funds settle via PG to merchant bank."
        };
        db.CommissionInvoices.Add(invoice);
        await db.SaveChangesAsync(ct);

        return new CommissionInvoiceDto(
            invoice.Id, invoice.InvoiceNumber, invoice.PeriodFrom, invoice.PeriodTo,
            invoice.GrossSuccessPaise, invoice.PlatformFeePaise, invoice.GstPaise, invoice.TotalPaise,
            invoice.Status.ToString(), invoice.RemitToNote, invoice.IssuedAt);
    }

    private async Task AuditAsync(string actorType, Guid? actorId, string action, string entityType, Guid? entityId, string? details, CancellationToken ct)
    {
        db.AuditLogs.Add(new AuditLog
        {
            ActorType = actorType,
            ActorId = actorId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            DetailsJson = details
        });
        await db.SaveChangesAsync(ct);
    }

    private static OrderDto ToOrderDto(Order order, string? paymentUrl) =>
        new(order.Id, order.MerchantOrderRef, order.AmountPaise, order.Currency, order.Status.ToString(), paymentUrl, order.CreatedAt);

    private static PaymentDto ToPaymentDto(PaymentTransaction t) =>
        new(t.Id, t.OrderId, t.Rail, t.GatewayCode, t.AmountPaise, t.Status.ToString(),
            t.CheckoutUrl, t.PspRef, t.Utr, t.FailureMessage, t.CreatedAt);
}

public class ApiException(int status, string code, string message) : Exception(message)
{
    public int StatusCode { get; } = status;
    public string Code { get; } = code;
}
