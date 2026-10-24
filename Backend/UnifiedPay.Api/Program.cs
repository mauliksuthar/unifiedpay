using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using UnifiedPay.Api.Data;
using UnifiedPay.Api.Security;
using UnifiedPay.Api.Services;
using UnifiedPay.Api.Services.Payments;

LoadRazorpayEnv();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHttpClient();

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Server=(localdb)\\mssqllocaldb;Database=UnifiedPayPhase1;Trusted_Connection=True;TrustServerCertificate=True";

builder.Services.AddDbContext<AppDbContext>(opt => opt.UseSqlServer(connectionString));

var jwtKey = builder.Configuration["Jwt:Key"] ?? "UnifiedPay-Phase1-Dev-Key-Change-In-Production-32chars!";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "unifiedpay",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "unifiedpay",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins(
                builder.Configuration["App:FrontendBaseUrl"] ?? "http://localhost:3000",
                "http://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddScoped<IPaymentGateway, MockRazorpayGateway>();
builder.Services.AddScoped<PaymentOrchestrationService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    var entity = db.Model.FindEntityType(typeof(UnifiedPay.Api.Domain.PaymentTransaction));
    if (entity?.GetTableName() is { } table)
    {
        var schema = entity.GetSchema() ?? "dbo";
        var columns = new (string Name, string Type)[]
        {
            ("CardHolderName", "nvarchar(120) NULL"),
            ("CardBrand", "nvarchar(20) NULL"),
            ("CardLast4", "nvarchar(4) NULL"),
            ("CardExpiry", "nvarchar(7) NULL"),
            ("BankIfsc", "nvarchar(11) NULL"),
            ("BankAccountLast4", "nvarchar(4) NULL"),
            ("BankBeneficiary", "nvarchar(200) NULL"),
            ("FeePaise", "bigint NOT NULL CONSTRAINT DF_Txn_Fee DEFAULT 0"),
            ("NetPaise", "bigint NOT NULL CONSTRAINT DF_Txn_Net DEFAULT 0"),
            ("SettlementStatus", "nvarchar(32) NOT NULL CONSTRAINT DF_Txn_Settle DEFAULT 'NOT_STARTED'")
        };
        foreach (var col in columns)
        {
            var sql = $"""
                IF COL_LENGTH('{schema}.{table}', '{col.Name}') IS NULL
                ALTER TABLE [{schema}].[{table}] ADD [{col.Name}] {col.Type};
                """;
            db.Database.ExecuteSqlRaw(sql);
        }
    }

    db.Database.ExecuteSqlRaw("""
        IF OBJECT_ID('dbo.SettlementAccounts', 'U') IS NULL
        CREATE TABLE dbo.SettlementAccounts (
            Id uniqueidentifier NOT NULL PRIMARY KEY,
            MerchantId uniqueidentifier NOT NULL,
            Label nvarchar(80) NOT NULL,
            BankName nvarchar(120) NOT NULL,
            HolderName nvarchar(200) NOT NULL,
            Ifsc nvarchar(11) NOT NULL,
            AccountLast4 nvarchar(4) NOT NULL,
            IsDefault bit NOT NULL,
            IsFrozen bit NOT NULL CONSTRAINT DF_SettlementAccounts_IsFrozen DEFAULT 0,
            CreatedAt datetimeoffset NOT NULL,
            CustomerId uniqueidentifier NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""
        IF COL_LENGTH('dbo.SettlementAccounts', 'CustomerId') IS NULL
        ALTER TABLE dbo.SettlementAccounts ADD CustomerId uniqueidentifier NULL;
        """);
    db.Database.ExecuteSqlRaw("""
        IF COL_LENGTH('dbo.SettlementAccounts', 'IsFrozen') IS NULL
        ALTER TABLE dbo.SettlementAccounts ADD IsFrozen bit NOT NULL CONSTRAINT DF_SettlementAccounts_IsFrozen DEFAULT 0;
        """);
    db.Database.ExecuteSqlRaw("""
        IF OBJECT_ID('dbo.Customers', 'U') IS NULL
        CREATE TABLE dbo.Customers (
            Id uniqueidentifier NOT NULL PRIMARY KEY,
            MerchantId uniqueidentifier NOT NULL,
            Name nvarchar(200) NOT NULL,
            Mobile nvarchar(20) NULL,
            Email nvarchar(200) NULL,
            CreatedAt datetimeoffset NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw("""
        INSERT INTO dbo.SettlementAccounts (Id, MerchantId, Label, BankName, HolderName, Ifsc, AccountLast4, IsDefault, CreatedAt)
        SELECT NEWID(), m.Id, 'Primary', 'Settlement bank', m.LegalName, m.SettlementIfsc, m.SettlementAccountLast4, 1, SYSUTCDATETIME()
        FROM dbo.Merchants m
        WHERE NOT EXISTS (SELECT 1 FROM dbo.SettlementAccounts s WHERE s.MerchantId = m.Id);
        """);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.MapGet("/", () => Results.Ok(new
{
    product = "UnifiedPay",
    phase = 1,
    openapi = "/openapi/v1.json",
    health = "/health",
    rule = "Customer funds never enter UnifiedPay accounts"
}));

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    phase = 1,
    product = "UnifiedPay",
    rule = "Customer funds never enter UnifiedPay accounts"
}));

app.Run();

static void LoadRazorpayEnv()
{
    var path = Path.Combine(Directory.GetCurrentDirectory(), ".env");
    if (!File.Exists(path))
        path = Path.Combine(AppContext.BaseDirectory, ".env");
    if (!File.Exists(path))
        return;

    foreach (var raw in File.ReadAllLines(path))
    {
        var line = raw.Trim();
        if (line.Length == 0 || line.StartsWith('#'))
            continue;
        var split = line.IndexOf('=');
        if (split <= 0)
            continue;
        var key = line[..split].Trim();
        var value = line[(split + 1)..].Trim().Trim('"');
        Environment.SetEnvironmentVariable(key, value);
    }
}
