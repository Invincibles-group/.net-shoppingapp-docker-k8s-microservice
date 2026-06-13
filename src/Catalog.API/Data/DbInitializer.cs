using Catalog.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Catalog.API.Data;

public static class DbInitializer
{
    public static async Task SeedAsync(CatalogDbContext db)
    {
        await db.Database.EnsureCreatedAsync();
        if (await db.Products.AnyAsync()) return;

        db.Products.AddRange(
            new Product { Id = Guid.NewGuid(), Name = "Mechanical Keyboard", Description = "Hot-swappable RGB mechanical keyboard", Price = 89.99m, Category = "Peripherals", AvailableStock = 50 },
            new Product { Id = Guid.NewGuid(), Name = "Wireless Mouse", Description = "Ergonomic wireless mouse", Price = 39.99m, Category = "Peripherals", AvailableStock = 120 },
            new Product { Id = Guid.NewGuid(), Name = "27-inch 4K Monitor", Description = "27 inch UHD IPS monitor", Price = 329.00m, Category = "Displays", AvailableStock = 30 },
            new Product { Id = Guid.NewGuid(), Name = "USB-C Hub", Description = "7-in-1 USB-C hub", Price = 49.50m, Category = "Accessories", AvailableStock = 200 },
            new Product { Id = Guid.NewGuid(), Name = "Noise Cancelling Headphones", Description = "Over-ear ANC headphones", Price = 199.99m, Category = "Audio", AvailableStock = 75 }
        );
        await db.SaveChangesAsync();
    }
}
