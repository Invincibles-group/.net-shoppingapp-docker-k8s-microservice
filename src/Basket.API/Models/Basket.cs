namespace Basket.API.Models;

public class BasketItem
{
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
}

public class CustomerBasket
{
    public string BuyerId { get; set; } = string.Empty;
    public List<BasketItem> Items { get; set; } = new();
    public decimal Total => Items.Sum(i => i.UnitPrice * i.Quantity);
}
