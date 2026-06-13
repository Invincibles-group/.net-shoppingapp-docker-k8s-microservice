using Catalog.API.Data;
using Catalog.API.Models;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var host = Environment.GetEnvironmentVariable("DB_HOST") ?? "localhost";
var dbName = Environment.GetEnvironmentVariable("POSTGRES_DB") ?? "catalogdb";
var user = Environment.GetEnvironmentVariable("POSTGRES_USER") ?? "postgres";
var pass = Environment.GetEnvironmentVariable("POSTGRES_PASSWORD") ?? "postgres";
var conn = $"Host={host};Port=5432;Database={dbName};Username={user};Password={pass}";
builder.Services.AddDbContext<CatalogDbContext>(o => o.UseNpgsql(conn));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Seed on startup (retry: DB may not be ready yet in container orchestration)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
    for (var attempt = 1; attempt <= 10; attempt++)
    {
        try { await DbInitializer.SeedAsync(db); break; }
        catch (Exception ex) when (attempt < 10)
        {
            Console.WriteLine($"DB not ready (attempt {attempt}): {ex.Message}. Retrying in 3s...");
            await Task.Delay(3000);
        }
    }
}

app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/health", () => Results.Ok("healthy"));

app.MapGet("/products", async (CatalogDbContext db) => await db.Products.ToListAsync());

app.MapGet("/products/{id:guid}", async (Guid id, CatalogDbContext db) =>
    await db.Products.FindAsync(id) is { } p ? Results.Ok(p) : Results.NotFound());

app.MapPost("/products", async (Product p, CatalogDbContext db) =>
{
    p.Id = Guid.NewGuid();
    db.Products.Add(p);
    await db.SaveChangesAsync();
    return Results.Created($"/products/{p.Id}", p);
});

app.MapPut("/products/{id:guid}", async (Guid id, Product input, CatalogDbContext db) =>
{
    var p = await db.Products.FindAsync(id);
    if (p is null) return Results.NotFound();
    p.Name = input.Name; p.Description = input.Description; p.Price = input.Price;
    p.Category = input.Category; p.AvailableStock = input.AvailableStock;
    await db.SaveChangesAsync();
    return Results.Ok(p);
});

app.MapDelete("/products/{id:guid}", async (Guid id, CatalogDbContext db) =>
{
    var p = await db.Products.FindAsync(id);
    if (p is null) return Results.NotFound();
    db.Products.Remove(p);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.Run();
