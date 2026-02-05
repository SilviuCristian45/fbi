namespace FbiApi.Models;

public record SetUserLocationRequest(
    double latitude,
    double longitude
);