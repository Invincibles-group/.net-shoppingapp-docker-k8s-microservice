var builder = WebApplication.CreateBuilder(args);
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();
app.MapGet("/", () => "Shopping API Gateway. Routes: /catalog, /basket, /order");
app.MapReverseProxy();
app.Run();
