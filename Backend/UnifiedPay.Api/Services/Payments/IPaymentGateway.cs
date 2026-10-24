namespace UnifiedPay.Api.Services.Payments;

public record PgCreatePaymentResult(
    string PspRef,
    string CheckoutUrl,
    string GatewayCode);

public record PgRefundResult(string PspRefundRef, string Status);

/// <summary>
/// Phase 1: credit-card collect via third-party PG.
/// Customer funds settle to merchant bank via the PG — never into UnifiedPay operating accounts.
/// </summary>
public interface IPaymentGateway
{
    string GatewayCode { get; }
    Task<PgCreatePaymentResult> CreateCardCheckoutAsync(
        Guid paymentId,
        long amountPaise,
        string currency,
        string? customerEmail,
        string? returnUrl,
        CancellationToken ct = default);

    Task<PgRefundResult> RefundAsync(string pspRef, long amountPaise, CancellationToken ct = default);
}
