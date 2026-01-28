namespace FbiApi.Models.Entities;

public class SaveWantedPerson
{
    public int Id { get; set; }
    public string UserId { get; set; }

    public int WantedPersonId { get; set; }
    public WantedPerson WantedPerson { get; set; }
}