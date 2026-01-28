namespace FbiApi.Models.Entities;

public class WantedFile
{
    public int Id { get; set; }
    public string? Name { get; set; } // ex: "English", "En Español"
    public string? Url { get; set; }

    public int WantedPersonId { get; set; }
    public WantedPerson WantedPerson { get; set; }
}