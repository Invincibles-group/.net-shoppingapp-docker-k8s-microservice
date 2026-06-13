using System.Text.Json;
using Basket.API.Models;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

var redisConn = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(redisConn));

// HttpClient to call Ordering on checkout
var orderingUrl = builder.Configuration["Services:Ordering"] ?? "http://localhost:5003";
builder.Services.AddHttpClient("ordering", c => c.BaseAddress = new Uri(orderingUrl));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseSwagger();
app.UseSwaggerUI();

static IDatabase Db(IConnectionMultiplexer mux) => mux.GetDatabase();
static string Key(string buyerId) => $"basket:{buyerId}";

app.MapGet("/health", () => Results.Ok("healthy"));

app.MapGet("/basket/{buyerId}", async (string buyerId, IConnectionMultiplexer mux) =>
{
    var data = await Db(mux).StringGetAsync(Key(buyerId));
    if (data.IsNullOrEmpty)
        return Results.Ok(new CustomerBasket { BuyerId = buyerId });
    return Results.Ok(JsonSerializer.Deserialize<CustomerBasket>(data!));
});

app.MapPost("/basket", async (CustomerBasket basket, IConnectionMultiplexer mux) =>
{
    var json = JsonSerializer.Serialize(basket);
    await Db(mux).StringSetAsync(Key(basket.BuyerId), json);
    return Results.Ok(basket);
});

app.MapDelete("/basket/{buyerId}", async (string buyerId, IConnectionMultiplexer mux) =>
{
    await Db(mux).KeyDeleteAsync(Key(buyerId));
    return Results.NoContent();
});

// Checkout: read basket, post an order to Ordering.API, clear basket
app.MapPost("/basket/{buyerId}/checkout", async (string buyerId, IConnectionMultiplexer mux, IHttpClientFactory http) =>
{
    var data = await Db(mux).StringGetAsync(Key(buyerId));
    if (data.IsNullOrEmpty) return Results.BadRequest("Basket is empty.");

    var basket = JsonSerializer.Deserialize<CustomerBasket>(data!)!;

    var orderPayload = new
    {
        buyerId = basket.BuyerId,
        items = basket.Items.Select(i => new
        {
            productId = i.ProductId,
            productName = i.ProductName,
            unitPrice = i.UnitPrice,
            quantity = i.Quantity
        })
    };

    var client = http.CreateClient("ordering");
    var resp = await client.PostAsJsonAsync("/orders", orderPayload);
    if (!resp.IsSuccessStatusCode)
        return Results.StatusCode((int)resp.StatusCode);

    await Db(mux).KeyDeleteAsync(Key(buyerId));
    var created = await resp.Content.ReadAsStringAsync();
    return Results.Ok(new { message = "Order placed", order = JsonDocument.Parse(created).RootElement });
});

app.Run();
