namespace FbiApi.Models;

// 1. DTO-ul "Slim" pentru Lista de Carduri (Grid)
// Aici trimitem doar strictul necesar.
public record WantedPersonSummaryResponse(
    int Id,
    string Title,
    string? Description, // Poate fi null
    string? RewardText,
    string? MainImageUrl, // Doar o singură poză (thumbnail)
    DateTime? PublicationDate
);

// 2. DTO-ul "Full" pentru Pagina de Detalii
// Aici trimitem tot.
public record WantedPersonDetailResponse(
    int Id,
    string Title,
    string? Description,
    string? Details,
    string? Caution,
    string? RewardText,
    // Caracteristici
    string? Sex,
    string? Race,
    string? Hair,
    string? Eyes,
    // Liste
    List<string> Images,   // Trimitem doar URL-urile, nu obiecte complexe
    List<string> Aliases,  // Lista simplă de nume
    List<string> Subjects  // Categoriile
);