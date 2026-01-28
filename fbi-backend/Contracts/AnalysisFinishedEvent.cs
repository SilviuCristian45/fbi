namespace FbiApi.Contracts
{
    public record AnalysisFinishedEvent
    {
        public int ReportId { get; init; }
        public bool Success { get; init; }
    }
}