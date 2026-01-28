using MassTransit;
using Microsoft.AspNetCore.SignalR;
using FbiApi.Contracts;
using FbiApi.Hubs; // Asigură-te că ai namespace-ul Hub-ului tău

namespace FbiApi.Consumers
{
    // Trebuie să mapăm JSON-ul simplu din Python la clasa noastră
    public class AnalysisFinishedConsumer : IConsumer<AnalysisFinishedEvent>
    {
        private readonly IHubContext<SurveilanceHub> _hubContext; // Înlocuiește 'FbiHub' cu numele clasei tale de Hub

        public AnalysisFinishedConsumer(IHubContext<SurveilanceHub> hubContext)
        {
            _hubContext = hubContext;
        }

        public async Task Consume(ConsumeContext<AnalysisFinishedEvent> context)
        {
            var reportId = context.Message.ReportId;
            Console.WriteLine($"⚡ [SignalR] Notifying clients about Report #{reportId}");

            // Trimitem evenimentul la TOȚI clienții conectați (sau doar la User dacă ai maparea făcută)
            // Numele evenimentului: "ReportProcessed"
            await _hubContext.Clients.All.SendAsync("ReportProcessed", new { 
                reportId = reportId,
                status = "COMPLETED"
            });
        }
    }
}