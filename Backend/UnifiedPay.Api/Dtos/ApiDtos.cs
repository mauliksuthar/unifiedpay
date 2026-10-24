namespace UnifiedPay.Api.Dtos;

public record ApiError(string Code, string Message, string RequestId, object? Details = null);

public record ErrorResponse(ApiError Error);

public record MerchantRegisterRequest(
    string LegalName,
    string Email,
    string Password,
    string MobileE164,
    string Pan,
    string? Gstin,
    string Mcc,
    string WebsiteUrl,
    string SettlementIfsc,
    string SettlementAccountNumber,
    string? BrandName);

public record MerchantLoginRequest(string Email, string Password);

public record AuthResponse(
    string AccessToken,
    int ExpiresIn,
    Guid MerchantId,
    string ApiKey,
    string Status);

public record MerchantDto(
    Guid Id,
    string LegalName,
    string? BrandName,
    string Email,
    string MobileE164,
    string PanMasked,
    string? Gstin,
    string Mcc,
    string WebsiteUrl,
    string SettlementIfsc,
    string SettlementAccountLast4,
    string Status,
    string ApiKey,
    decimal PlatformFeePercent);

public record CreateOrderRequest(
    string MerchantOrderRef,
    long AmountPaise,
    string? CustomerMobile,
    string? CustomerEmail,
    string? ReturnUrl,
    string Currency = "INR");

public record OrderDto(
    Guid Id,
    string MerchantOrderRef,
    long AmountPaise,
    string Currency,
    string Status,
    string? PaymentUrl,
    DateTimeOffset CreatedAt);

public record CreatePaymentRequest(string Rail = "CREDIT");

/// <summary>Card display fields only. Full PAN and CVV must never be sent.</summary>
public record CardToBankRequest(
    long AmountPaise,
    Guid SettlementAccountId,
    string CardHolderName,
    string CardBrand,
    string CardLast4,
    string CardExpiry,
    string? CustomerEmail,
    string? CustomerMobile);

public record CreateCustomerRequest(string Name, string? Mobile, string? Email);

public record AddSettlementAccountRequest(
    string Label,
    string BankName,
    string HolderName,
    string Ifsc,
    string AccountNumber,
    Guid? CustomerId = null);

public record UpdateSettlementAccountRequest(
    string Label,
    string BankName,
    string HolderName,
    string Ifsc,
    string? AccountNumber,
    Guid? CustomerId);

public record SetFrozenRequest(bool Frozen);

public record PaymentDto(
    Guid Id,
    Guid OrderId,
    string Rail,
    string GatewayCode,
    long AmountPaise,
    string Status,
    string? CheckoutUrl,
    string? PspRef,
    string? Utr,
    string? FailureMessage,
    DateTimeOffset CreatedAt);

public record CreateRefundRequest(long AmountPaise, string? Reason);

public record RefundDto(Guid Id, Guid TransactionId, long AmountPaise, string Status, string? PspRefundRef);

public record WebhookPayload(string Event, string PspRef, string Status, string? Utr, string? FailureCode);

public record CommissionInvoiceDto(
    Guid Id,
    string InvoiceNumber,
    DateOnly PeriodFrom,
    DateOnly PeriodTo,
    long GrossSuccessPaise,
    long PlatformFeePaise,
    long GstPaise,
    long TotalPaise,
    string Status,
    string RemitToNote,
    DateTimeOffset IssuedAt);

public record FreezeMerchantRequest(string Reason);

public record AdminMerchantRequest(
    string LegalName,
    string Email,
    string? Password,
    string MobileE164,
    string? Pan,
    string? Gstin,
    string? Mcc,
    string? WebsiteUrl,
    string? SettlementIfsc,
    string? SettlementAccountNumber,
    string? BrandName,
    decimal? PlatformFeePercent,
    string? Status);
