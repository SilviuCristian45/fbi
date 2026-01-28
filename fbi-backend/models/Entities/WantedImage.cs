namespace FbiApi.Models.Entities;

public class WantedImage
{
    public int Id { get; set; }
    
    public string? Caption { get; set; }
    public string? OriginalUrl { get; set; }
    public string? LargeUrl { get; set; }
    public string? ThumbUrl { get; set; }

    // Foreign Key
    public int WantedPersonId { get; set; }
    public WantedPerson WantedPerson { get; set; }
}