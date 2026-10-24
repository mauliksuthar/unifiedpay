namespace UnifiedPay.Api.Services.Payments;

/// <summary>
/// Dev/stub adapter that mimics Razorpay-style hosted checkout redirect.
/// Replace with real Razorpay/Cashfree SDK when PG partner keys are available.
/// PCI: no PAN/CVV ever accepted here.
/// </summary>
public class MockRazorpayGateway(IConfiguration config) : IPaymentGateway
{
    public string GatewayCode => "MOCK_RAZORPAY";

    public Task<PgCreatePaymentResult> CreateCardCheckoutAsync(
        Guid paymentId,
        long amountPaise,
        string currency,
        string? customerEmail,
        string? returnUrl,
        CancellationToken ct = default)
    {
        var publicBase = config["App:PublicBaseUrl"] ?? "https://localhost:7240";
        var pspRef = $"pay_mock_{paymentId:N}"[..28];
        var checkoutUrl =
            $"{publicBase}/v1/checkout/mock?paymentId={paymentId}&pspRef={pspRef}&amount={amountPaise}&returnUrl={Uri.EscapeDataString(returnUrl ?? "")}";

        return Task.FromResult(new PgCreatePaymentResult(pspRef, checkoutUrl, GatewayCode));
    }

    public Task<PgRefundResult> RefundAsync(string pspRef, long amountPaise, CancellationToken ct = default)
        => Task.FromResult(new PgRefundResult($"rfnd_mock_{Guid.NewGuid():N}"[..24], "PROCESSING"));
}
