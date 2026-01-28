using System.Text.Json.Serialization;

namespace FbiApi.Models;

// 1. Rădăcina JSON-ului ("total", "items")
public record FbiResponse(
    [property: JsonPropertyName("total")] int Total,
    [property: JsonPropertyName("page")] int Page,
    [property: JsonPropertyName("items")] List<FbiItem> Items
);

// 2. Elementul principal (Infractorul)
public record FbiItem(
    // Identificatori
    [property: JsonPropertyName("uid")] string Uid,
    [property: JsonPropertyName("pathId")] string PathId,
    [property: JsonPropertyName("ncic")] string? Ncic, // Poate fi null

    // Texte Principale
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("details")] string? Details, // HTML
    [property: JsonPropertyName("caution")] string? Caution, // HTML
    [property: JsonPropertyName("remarks")] string? Remarks, // HTML
    [property: JsonPropertyName("warning_message")] string? WarningMessage,

    // Recompense
    [property: JsonPropertyName("reward_text")] string? RewardText,
    [property: JsonPropertyName("reward_min")] int? RewardMin,
    [property: JsonPropertyName("reward_max")] int? RewardMax,

    // Detalii Fizice
    [property: JsonPropertyName("sex")] string? Sex,
    [property: JsonPropertyName("race")] string? Race,
    [property: JsonPropertyName("race_raw")] string? RaceRaw,
    [property: JsonPropertyName("hair")] string? Hair,
    [property: JsonPropertyName("hair_raw")] string? HairRaw,
    [property: JsonPropertyName("eyes")] string? Eyes,
    [property: JsonPropertyName("eyes_raw")] string? EyesRaw,
    [property: JsonPropertyName("complexion")] string? Complexion,
    [property: JsonPropertyName("build")] string? Build,
    [property: JsonPropertyName("scars_and_marks")] string? ScarsAndMarks,

    // Măsurători (Int? pentru că pot fi null)
    [property: JsonPropertyName("height_min")] int? HeightMin,
    [property: JsonPropertyName("height_max")] int? HeightMax,
    [property: JsonPropertyName("weight_min")] int? WeightMin,
    [property: JsonPropertyName("weight_max")] int? WeightMax,
    [property: JsonPropertyName("age_min")] int? AgeMin,
    [property: JsonPropertyName("age_max")] int? AgeMax,

    // Origine
    [property: JsonPropertyName("nationality")] string? Nationality,
    [property: JsonPropertyName("place_of_birth")] string? PlaceOfBirth,

    // Liste Simple de String-uri
    [property: JsonPropertyName("aliases")] List<string>? Aliases,
    [property: JsonPropertyName("subjects")] List<string>? Subjects,
    [property: JsonPropertyName("field_offices")] List<string>? FieldOffices,
    [property: JsonPropertyName("occupations")] List<string>? Occupations,
    [property: JsonPropertyName("dates_of_birth_used")] List<string>? DatesOfBirthUsed,
    [property: JsonPropertyName("locations")] List<string>? Locations,

    // Liste de Obiecte (Imagini și Fișiere)
    [property: JsonPropertyName("images")] List<FbiImage>? Images,
    [property: JsonPropertyName("files")] List<FbiFile>? Files,

    // Date (Folosim DateTime?, C# convertește automat ISO 8601)
    [property: JsonPropertyName("modified")] DateTime? Modified,
    [property: JsonPropertyName("publication")] DateTime? Publication,
    
    // Status
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("person_classification")] string? PersonClassification
);

// 3. Obiectul Imagine
public record FbiImage(
    [property: JsonPropertyName("caption")] string? Caption,
    [property: JsonPropertyName("original")] string? Original,
    [property: JsonPropertyName("large")] string? Large,
    [property: JsonPropertyName("thumb")] string? Thumb
);

// 4. Obiectul Fișier (PDF)
public record FbiFile(
    [property: JsonPropertyName("url")] string? Url,
    [property: JsonPropertyName("name")] string? Name
);