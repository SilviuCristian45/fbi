using FbiApi.Models;
using FbiApi.Models.Entities;

namespace FbiApi.Mappers;

public static class WantedPersonMappers
{
    // Mapare pentru LISTĂ (Summary)
    public static WantedPersonSummaryResponse ToSummaryDto(this WantedPerson person)
    {
        return new WantedPersonSummaryResponse(
            Id: person.Id,
            Title: person.Title ?? "Unknown",
            Description: person.Description != null && person.Description.Length > 100 
                ? person.Description.Substring(0, 100) + "..." // Trunchiem descrierea pt listă
                : person.Description,
            RewardText: person.RewardText,
            // Luăm prima poză disponibilă sau un placeholder
            MainImageUrl: person.Images.FirstOrDefault()?.OriginalUrl ?? "https://via.placeholder.com/300",
            PublicationDate: person.PublicationDate
        );
    }

    public static WantedPersonDetailResponse ToDetailDto(this WantedPerson person)
    {
        return new WantedPersonDetailResponse(
            Id: person.Id,
            Title: person.Title ?? "Unknown",
            Description: person.Description,
            Details: person.Details,
            Caution: person.Caution,
            RewardText: person.RewardText,
            Sex: person.Sex,
            Race: person.Race,
            Hair: person.Hair,
            Eyes: person.Eyes,
            // Flattening: Transformăm obiectele copil în liste simple de string-uri
            Images: person.Images.Select(i => i.OriginalUrl).Where(u => u != null).Cast<string>().ToList(),
            Aliases: person.Aliases.Select(a => a.Name).ToList(),
            Subjects: person.Subjects.Select(s => s.Name).ToList()
        );
    }
}