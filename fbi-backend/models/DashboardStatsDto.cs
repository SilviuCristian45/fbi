public class DashboardStatsDto
{
    public int TotalSuspects { get; set; }
    public int TotalSightings { get; set; }
    public List<ChartDataPoint> ActivityLast7Days { get; set; }
    public List<TopSuspectDto> TopSuspects { get; set; }
}

public class ChartDataPoint
{
    public string Date { get; set; } // Trimitem ca string "Mon", "Tue" sau "2024-05-10"
    public int Count { get; set; }
}

public class TopSuspectDto
{
    public string Name { get; set; }
    public int SightingsCount { get; set; }
}