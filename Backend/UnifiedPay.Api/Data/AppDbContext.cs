using Microsoft.EntityFrameworkCore;
using UnifiedPay.Api.Domain;

namespace UnifiedPay.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Merchant> Merchants => Set<Merchant>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<PaymentTransaction> Transactions => Set<PaymentTransaction>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<CommissionInvoice> CommissionInvoices => Set<CommissionInvoice>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<SettlementAccount> SettlementAccounts => Set<SettlementAccount>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Merchant>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.ApiKey).IsUnique();
            e.Property(x => x.PlatformFeePercent).HasPrecision(5, 2);
        });

        modelBuilder.Entity<Order>(e =>
        {
            e.HasIndex(x => new { x.MerchantId, x.MerchantOrderRef }).IsUnique();
            e.HasOne(x => x.Merchant).WithMany(m => m.Orders).HasForeignKey(x => x.MerchantId);
        });

        modelBuilder.Entity<PaymentTransaction>(e =>
        {
            e.HasIndex(x => x.IdempotencyKey).IsUnique();
            e.HasIndex(x => x.PspRef);
            e.HasOne(x => x.Order).WithMany(o => o.Transactions).HasForeignKey(x => x.OrderId);
        });

        modelBuilder.Entity<Refund>(e =>
        {
            e.HasIndex(x => x.IdempotencyKey).IsUnique();
            e.HasOne(x => x.Transaction).WithMany(t => t.Refunds).HasForeignKey(x => x.TransactionId);
        });

        modelBuilder.Entity<SettlementAccount>(e =>
        {
            e.HasIndex(x => new { x.MerchantId, x.Ifsc, x.AccountLast4 }).IsUnique();
            e.HasOne(x => x.Merchant).WithMany(m => m.SettlementAccounts).HasForeignKey(x => x.MerchantId);
        });

        modelBuilder.Entity<CommissionInvoice>(e =>
        {
            e.HasIndex(x => x.InvoiceNumber).IsUnique();
            e.HasOne(x => x.Merchant).WithMany(m => m.Invoices).HasForeignKey(x => x.MerchantId);
        });
    }
}
