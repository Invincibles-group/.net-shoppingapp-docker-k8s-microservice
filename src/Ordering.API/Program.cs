using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Ordering.API.Data;
using Ordering.API.Models;

var builder = WebApplication.CreateBuilder(args);

var host = Environment.GetEnvironmentVariable("DB_HOST") ?? "localhost";
var dbName = Environment.GetEnvironmentVariable("POSTGRES_DB") ?? "orderingdb";
var user = Environment.GetEnvironmentVariable("POSTGRES_USER") ?? "postgres";
var pass = Environment.GetEnvironmentVariable("POSTGRES_PASSWORD") ?? "postgres";
var conn = $"Host={host};Port=5432;Database={dbName};Username={user};Password={pass}";
builder.Services.AddDbContext<OrderingDbContext>(o => o.UseNpgsql(conn));

var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-secret-change-me-please-0123456789abcdef";
var issuer = builder.Configuration["Jwt:Issuer"] ?? "shopping-identity";
var audience = builder.Configuration["Jwt:Audience"] ?? "shopping-clients";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts =>
    {
        opts.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<OrderingDbContext>();
    for (var attempt = 1; attempt <= 10; attempt++)
    {
        try { await db.Database.EnsureCreatedAsync(); break; }
        catch (Exception ex) when (attempt < 10)
        {
            Console.WriteLine($"DB not ready (attempt {attempt}): {ex.Message}. Retrying in 3s...");
            await Task.Delay(3000);
        }
    }
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok("healthy"));

// Admin only: every order in the system.
app.MapGet("/orders", async (OrderingDbContext db) =>
    await db.Orders.Include(o => o.Items).OrderByDescending(o => o.OrderDate).ToListAsync())
   .RequireAuthorization(p => p.RequireRole("Admin"));

// Authenticated customer: only their own orders (buyerId == token name).
app.MapGet("/orders/mine", async (ClaimsPrincipal user, OrderingDbContext db) =>
{
    var me = user.Identity?.Name ?? "";
    return await db.Orders.Include(o => o.Items)
        .Where(o => o.BuyerId == me)
        .OrderByDescending(o => o.OrderDate)
        .ToListAsync();
}).RequireAuthorization();

// Called internally by Basket.API at checkout. (Internal-only in a real deployment.)
app.MapPost("/orders", async (Order order, OrderingDbContext db) =>
{
    order.Id = Guid.NewGuid();
    order.OrderDate = DateTime.UtcNow;
    order.Status = "Submitted";
    db.Orders.Add(order);
    await db.SaveChangesAsync();
    return Results.Created($"/orders/detail/{order.Id}", order);
});

app.Run();
