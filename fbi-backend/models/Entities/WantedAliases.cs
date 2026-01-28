namespace FbiApi.Models.Entities;

public class WantedAlias
{
    public int Id { get; set; }
    public string Name { get; set; } // Un singur alias (ex: "Cindy Cecilia Rodriguez")

    public int WantedPersonId { get; set; }
    public WantedPerson WantedPerson { get; set; }
}