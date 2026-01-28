namespace FbiApi.Models;
public record LocationReportDto(
    int Id, 
    decimal Lat, 
    decimal Lng, 
    string Details, 
    string ReportedBy, // Username-ul agentului
    DateTime Timestamp,
    int WantedPersonId,
    string? FileUrl
);