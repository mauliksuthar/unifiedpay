using UnifiedPay.Api.Domain;

namespace UnifiedPay.Api.Services;

public static class TransactionView
{
    public static object Summary(PaymentTransaction t) => new
    {
        t.Id,
        t.OrderId,
        merchantOrderRef = t.Order.MerchantOrderRef,
        t.Rail,
        t.GatewayCode,
        t.AmountPaise,
        t.FeePaise,
        t.NetPaise,
        status = t.Status.ToString(),
        t.SettlementStatus,
        t.CardBrand,
        t.CardLast4,
        t.CardHolderName,
        t.CardExpiry,
        maskedCard = Mask(t.CardLast4),
        t.BankIfsc,
        t.BankAccountLast4,
        t.BankBeneficiary,
        t.Utr,
        t.PspRef,
        t.FailureCode,
        t.FailureMessage,
        refundCount = t.Refunds.Count,
        t.CreatedAt,
        t.UpdatedAt
    };

    public static object Detail(PaymentTransaction t)
    {
        var refunds = t.Refunds.OrderByDescending(r => r.CreatedAt).Select(r => new
        {
            r.Id,
            r.AmountPaise,
            r.Reason,
            r.Status,
            r.PspRefundRef,
            r.CreatedAt
        });

        return new
        {
            summary = Summary(t),
            card = new
            {
                holder = t.CardHolderName,
                brand = t.CardBrand,
                last4 = t.CardLast4,
                expiry = t.CardExpiry,
                masked = Mask(t.CardLast4),
                stored = "last4 + brand + expiry only. Full number and CVV are not stored."
            },
            bank = new
            {
                beneficiary = t.BankBeneficiary ?? t.Order.Merchant.LegalName,
                ifsc = t.BankIfsc ?? t.Order.Merchant.SettlementIfsc,
                accountMasked = $"****{t.BankAccountLast4 ?? t.Order.Merchant.SettlementAccountLast4}",
                settledBy = "Licensed payment gateway escrow — not UnifiedPay"
            },
            money = new
            {
                grossPaise = t.AmountPaise,
                pgMdrNote = "Illustrative PG MDR 2% is deducted by the gateway before bank credit",
                netToMerchantBankPaise = t.NetPaise,
                unifiedPayFeePaise = t.FeePaise,
                feePath = "Platform fee is invoiced to UnifiedPay fee account. It is not taken from customer settlement."
            },
            gateway = new { t.GatewayCode, t.PspRef, t.Utr, t.FailureCode, t.FailureMessage },
            refunds,
            timeline = BuildTimeline(t)
        };
    }

    private static string Mask(string? last4) =>
        string.IsNullOrWhiteSpace(last4) ? "**** **** **** ****" : $"**** **** **** {last4}";

    private static object[] BuildTimeline(PaymentTransaction t)
    {
        var created = t.CreatedAt;
        var done = t.UpdatedAt;
        var success = t.Status == PaymentStatus.Success;
        var failed = t.Status == PaymentStatus.Failed;
        var reversed = t.Status == PaymentStatus.Reversed;

        return
        [
            Step("1. Card details accepted (masked)", "done", created, $"Brand {t.CardBrand}, {Mask(t.CardLast4)}, expiry {t.CardExpiry}. CVV discarded."),
            Step("2. Sent to payment gateway", "done", created.AddSeconds(1), $"Gateway {t.GatewayCode}. PSP ref {t.PspRef ?? "pending"}."),
            Step("3. Issuer authorization", failed ? "failed" : "done", created.AddSeconds(2),
                failed ? $"{t.FailureCode}: {t.FailureMessage}" : "Issuer approved the card payment."),
            Step("4. PG escrow / capture", success || reversed ? "done" : "skipped", created.AddSeconds(3),
                failed ? "No capture. Customer was not charged." : "Funds held in the licensed PG escrow, not in UnifiedPay."),
            Step("5. Settlement to merchant bank", success || reversed ? "done" : "skipped", done,
                success || reversed
                    ? $"Credit {t.BankIfsc} ****{t.BankAccountLast4}. UTR {t.Utr}. Net ₹{t.NetPaise / 100m:0.00}."
                    : "Settlement not started."),
            Step("6. Reversal to original card", reversed ? "done" : "pending", done,
                reversed
                    ? "Full amount reversed to the original card. Bank credit is clawed back by the PG."
                    : "No reversal requested."),
            Step("7. UnifiedPay commission", success ? "done" : "pending", done,
                success
                    ? $"Platform fee ₹{t.FeePaise / 100m:0.00} is billed by invoice to the UnifiedPay fee account."
                    : "No commission on a failed or reversed payment.")
        ];
    }

    private static object Step(string name, string state, DateTimeOffset at, string detail) =>
        new { name, state, at, detail };
}
