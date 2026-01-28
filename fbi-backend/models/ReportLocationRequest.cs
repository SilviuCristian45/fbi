namespace FbiApi.Models;

using System.ComponentModel.DataAnnotations;

public record ReportLocationRequest
{
    [Required]
    public int WantedId { get; init; }

    [Range(-90, 90, ErrorMessage = "Latitudinea trebuie să fie între -90 și 90")]
    public decimal Lat { get; init; }

    [Range(-180, 180, ErrorMessage = "Longitudinea trebuie să fie între -180 și 180")]
    public decimal Lng { get; init; }

    [MaxLength(500, ErrorMessage = "Detaliile nu pot depăși 500 de caractere")]
    public string? Details { get; init; }

    public string? FileUrl {get; set;}
}