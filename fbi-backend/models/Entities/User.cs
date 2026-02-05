namespace FbiApi.Models.Entities;

public class User
{
    public int Id { get; set; }
    
    public string UserId {get; set; }

    public decimal Longitude { get; set; }
    public decimal Latitude { get; set; }
}