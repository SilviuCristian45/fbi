using System.Text.Json.Serialization;

namespace FbiApi.Models;
public record MatchItem(
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("confidence")] double Confidence
);

public record CheckImageFaceRecognitionResponse(
    [property: JsonPropertyName("matches")] List<MatchItem> Matches
);