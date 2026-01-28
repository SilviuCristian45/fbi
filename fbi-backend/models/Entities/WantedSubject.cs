namespace FbiApi.Models.Entities;

public class WantedSubject
{
    public int Id { get; set; }
    public string Name { get; set; }

    public int WantedPersonId { get; set; }
    public WantedPerson WantedPerson { get; set; }
}