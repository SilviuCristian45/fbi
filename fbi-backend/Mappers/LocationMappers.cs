using FbiApi.Models;
using FbiApi.Models.Entities;

namespace FbiApi.Mappers;

public static class LocationMappers
{
    // Mapare pentru LISTĂ (Summary)
    public static ReportDto toReportDto(this LocationWantedPerson person)
    {
        return new ReportDto(
            Id: person.Id,
            Name: person.WantedPerson.Title,
            Url: person.FileUrl,
            Description: person.Description,
            Lat: person.Latitude,
            Lon: person.Longitude,
            WantedPersonId: person.WantedPersonId,
            Status: person.Status,
            Matches: person.personMatchResults.Select(p => new MatchItemDto(p.ImageUrl, p.Confidence)).ToList()
        );
    }
}