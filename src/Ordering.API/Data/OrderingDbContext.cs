using Microsoft.EntityFrameworkCore;
using Ordering.API.Models;

namespace Ordering.API.Data;

public class OrderingDbContext(DbContextOptions<OrderingDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Order>(e =>
        {
            e.HasKey(o => o.Id);
            e.Ignore(o => o.Total);
            e.HasMany(o => o.Items).WithOne().OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<OrderItem>(e =>
        {
            e.HasKey(i => i.Id);
            e.Property(i => i.UnitPrice).HasColumnType("numeric(18,2)");
        });
    }
}
