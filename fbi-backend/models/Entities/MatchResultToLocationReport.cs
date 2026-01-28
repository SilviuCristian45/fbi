namespace FbiApi.Models.Entities;

public class PersonMatchResults
{
    public int Id { get; set; }

    public string ImageUrl { get; set; }

    public double Confidence {get; set;}

    public int LocationWantedPersonId { get; set; }
    public LocationWantedPerson LocationWantedPerson { get; set; }

}