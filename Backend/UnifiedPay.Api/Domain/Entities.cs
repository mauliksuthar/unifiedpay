namespace UnifiedPay.Api.Domain;

public enum MerchantStatus
{
    Onboarding = 0,
    Active = 1,
    Frozen = 2,
    Rejected = 3
}

public enum OrderStatus
{
    Created = 0,
    Pending = 1,
    Paid = 2,
    Failed = 3,
    Cancelled = 4
}

public enum PaymentStatus
{
    Initiated = 0,
    Pending = 1,
    Success = 2,
    Failed = 3,
    Reversed = 4
}

public enum InvoiceStatus
{
    Draft = 0,
    Issued = 1,
    Paid = 2,
    Overdue = 3
}

public class Merchant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string LegalName { get; set; } = string.Empty;
    public string? BrandName { get; set; }
    public string Email { get; set; } = string.Empty;
    public string MobileE164 { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string PanMasked { get; set; } = string.Empty;
    public string? Gstin { get; set; }
    public string Mcc { get; set; } = "5411";
    public string WebsiteUrl { get; set; } = string.Empty;
    public string SettlementIfsc { get; set; } = string.Empty;
    public string SettlementAccountLast4 { get; set; } = string.Empty;
    public MerchantStatus Status { get; set; } = MerchantStatus.Onboarding;
    public string ApiKey { get; set; } = string.Empty;
    public string ApiSecretHash { get; set; } = string.Empty;
    public decimal PlatformFeePercent { get; set; } = 0.25m;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Order> Orders { get; set; } = new List<Order>();
    public ICollection<CommissionInvoice> Invoices { get; set; } = new List<CommissionInvoice>();
    public ICollection<Customer> Customers { get; set; } = new List<Customer>();
    public ICollection<SettlementAccount> SettlementAccounts { get; set; } = new List<SettlementAccount>();
}

public class Customer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MerchantId { get; set; }
    public Merchant Merchant { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string? Mobile { get; set; }
    public string? Email { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<SettlementAccount> Accounts { get; set; } = new List<SettlementAccount>();
}

public class SettlementAccount
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MerchantId { get; set; }
    public Merchant Merchant { get; set; } = null!;
    public string Label { get; set; } = "Primary";
    public string BankName { get; set; } = string.Empty;
    public string HolderName { get; set; } = string.Empty;
    public string Ifsc { get; set; } = string.Empty;
    public string AccountLast4 { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
    public bool IsFrozen { get; set; }
    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MerchantId { get; set; }
    public Merchant Merchant { get; set; } = null!;
    public string MerchantOrderRef { get; set; } = string.Empty;
    public long AmountPaise { get; set; }
    public string Currency { get; set; } = "INR";
    public string? CustomerMobile { get; set; }
    public string? CustomerEmail { get; set; }
    public string? ReturnUrl { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Created;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<PaymentTransaction> Transactions { get; set; } = new List<PaymentTransaction>();
}

public class PaymentTransaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public string Rail { get; set; } = "CREDIT";
    public string GatewayCode { get; set; } = "MOCK_RAZORPAY";
    public long AmountPaise { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Initiated;
    public string IdempotencyKey { get; set; } = string.Empty;
    public string? PspRef { get; set; }
    public string? Utr { get; set; }
    public string? CheckoutUrl { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }
    /// <summary>Masked display only. Full PAN and CVV are never stored.</summary>
    public string? CardHolderName { get; set; }
    public string? CardBrand { get; set; }
    public string? CardLast4 { get; set; }
    public string? CardExpiry { get; set; }
    public string? BankIfsc { get; set; }
    public string? BankAccountLast4 { get; set; }
    public string? BankBeneficiary { get; set; }
    public long FeePaise { get; set; }
    public long NetPaise { get; set; }
    public string SettlementStatus { get; set; } = "NOT_STARTED";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Refund> Refunds { get; set; } = new List<Refund>();
}

public class Refund
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TransactionId { get; set; }
    public PaymentTransaction Transaction { get; set; } = null!;
    public Guid MerchantId { get; set; }
    public long AmountPaise { get; set; }
    public string? Reason { get; set; }
    public string Status { get; set; } = "REQUESTED";
    public string IdempotencyKey { get; set; } = string.Empty;
    public string? PspRefundRef { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class CommissionInvoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MerchantId { get; set; }
    public Merchant Merchant { get; set; } = null!;
    public string InvoiceNumber { get; set; } = string.Empty;
    public DateOnly PeriodFrom { get; set; }
    public DateOnly PeriodTo { get; set; }
    public long GrossSuccessPaise { get; set; }
    public long PlatformFeePaise { get; set; }
    public long GstPaise { get; set; }
    public long TotalPaise { get; set; }
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Issued;
    /// <summary>UnifiedPay fee-income bank only — never customer settlement.</summary>
    public string RemitToNote { get; set; } = "UnifiedPay fee/commission account (not merchant settlement)";
    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? PaidAt { get; set; }
}

public class AuditLog
{
    public long Id { get; set; }
    public string ActorType { get; set; } = "SYSTEM";
    public Guid? ActorId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }
    public string? DetailsJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
