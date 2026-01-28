namespace FbiApi.Contracts
{
    // Acesta este ordinul de lucru. Nu conține rezultate.
    public record AnalyzeFaceCommand
    {
        public int ReportId { get; init; }    // "Pentru raportul #50..."
        public string ImageUrl { get; init; } // "...analizează poza de la acest URL"
    }
}