using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Identity.API;
using Identity.API.Data;
using Identity.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var host = Environment.GetEnvironmentVariable("DB_HOST") ?? "localhost";
var dbName = Environment.GetEnvironmentVariable("POSTGRES_DB") ?? "identitydb";
var user = Environment.GetEnvironmentVariable("POSTGRES_USER") ?? "postgres";
var pass = Environment.GetEnvironmentVariable("POSTGRES_PASSWORD") ?? "postgres";
var conn = $"Host={host};Port=5432;Database={dbName};Username={user};Password={pass}";
builder.Services.AddDbContext<IdentityDbContext>(o => o.UseNpgsql(conn));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-secret-change-me-please-0123456789abcdef";
var issuer = builder.Configuration["Jwt:Issuer"] ?? "shopping-identity";
var audience = builder.Configuration["Jwt:Audience"] ?? "shopping-clients";

// Seed schema + a default admin (admin / admin123).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
    for (var attempt = 1; attempt <= 10; attempt++)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            if (!await db.Users.AnyAsync(u => u.Username == "admin"))
            {
                db.Users.Add(new AppUser
                {
                    Id = Guid.NewGuid(),
                    Username = "admin",
                    PasswordHash = Passwords.Hash("admin123"),
                    Role = "Admin"
                });
                await db.SaveChangesAsync();
            }
            break;
        }
        catch (Exception ex) when (attempt < 10)
        {
            Console.WriteLine($"DB not ready (attempt {attempt}): {ex.Message}. Retrying in 3s...");
            await Task.Delay(3000);
        }
    }
}

string CreateToken(AppUser u)
{
    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
    var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var claims = new[]
    {
        new Claim(JwtRegisteredClaimNames.Sub, u.Id.ToString()),
        new Claim(ClaimTypes.Name, u.Username),
        new Claim(ClaimTypes.Role, u.Role)
    };
    var token = new JwtSecurityToken(issuer, audience, claims,
        expires: DateTime.UtcNow.AddHours(8), signingCredentials: creds);
    return new JwtSecurityTokenHandler().WriteToken(token);
}

app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/health", () => Results.Ok("healthy"));

app.MapPost("/register", async (RegisterRequest req, IdentityDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(req.Username) || req.Password?.Length < 4)
        return Results.BadRequest(new { error = "Username required and password must be at least 4 characters." });

    var uname = req.Username.Trim();
    if (await db.Users.AnyAsync(u => u.Username == uname))
        return Results.Conflict(new { error = "That username is taken." });

    var user = new AppUser
    {
        Id = Guid.NewGuid(),
        Username = uname,
        PasswordHash = Passwords.Hash(req.Password!),
        Role = "Customer"
    };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    return Results.Ok(new AuthResponse(CreateToken(user), user.Username, user.Role));
});

app.MapPost("/login", async (LoginRequest req, IdentityDbContext db) =>
{
    var uname = req.Username?.Trim() ?? "";
    var user = await db.Users.FirstOrDefaultAsync(u => u.Username == uname);
    if (user is null || !Passwords.Verify(req.Password ?? "", user.PasswordHash))
        return Results.Json(new { error = "Wrong username or password." }, statusCode: 401);

    return Results.Ok(new AuthResponse(CreateToken(user), user.Username, user.Role));
});

app.Run();
