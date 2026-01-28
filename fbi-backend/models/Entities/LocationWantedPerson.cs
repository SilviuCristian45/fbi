namespace FbiApi.Models.Entities;

public class LocationWantedPerson
{
    public int Id { get; set; }
    public decimal Latitude { get; set; }

    public decimal Longitude { get; set; }

    public string Description {get; set; }

    public string UserId {get; set;}

    public string Username {get; set;}

    public DateTime ReportedAt {get; set;}

    public string FileUrl { get; set; }

    public int WantedPersonId { get; set; }
    public WantedPerson WantedPerson { get; set; }

    public List<PersonMatchResults> personMatchResults { get; set; } = new();

    public ReportStatus Status { get; set; } = ReportStatus.Pending;
}