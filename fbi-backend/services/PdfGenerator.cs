using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

public static class PdfGenerator
{
    // Modele de date (simple, doar pentru PDF)
    public record PdfData(string Name, string Description, string ImageUrl, List<PdfSighting> Sightings);
    public record PdfSighting(string ReportedBy, DateTime Time, string Details, decimal Lat, decimal Lng);

    public static byte[] GenerateDossier(PdfData data)
    {
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(x => x.FontSize(11).FontFamily("Arial"));

                // 1. HEADER
                page.Header().Row(row =>
                {
                    row.RelativeItem().Column(col =>
                    {
                        col.Item().Text("FEDERAL BUREAU OF INVESTIGATION").FontSize(20).Bold().FontColor(Colors.Blue.Darken3);
                        col.Item().Text("CRIMINAL INVESTIGATION DIVISION").FontSize(10).LetterSpacing(0.1f);
                    });

                    row.ConstantItem(100).AlignRight().Text("TOP SECRET").FontSize(14).Bold().FontColor(Colors.Red.Medium);
                });

                // 2. CONTENT
                page.Content().PaddingVertical(1, Unit.Centimetre).Column(col =>
                {
                    // Secțiunea Suspect
                    col.Item().Row(row =>
                    {
                        // Stânga: Date Text
                        row.RelativeItem().Column(details =>
                        {
                            details.Item().Text($"SUBJECT: {data.Name.ToUpper()}").FontSize(16).Bold();
                            details.Item().PaddingTop(10).Text("STATUS: WANTED / FUGITIVE").FontColor(Colors.Red.Medium).Bold();
                            details.Item().PaddingTop(10).Text("DESCRIPTION:").Bold();
                            details.Item().Text(data.Description).Italic();
                        });

                        // Dreapta: Loc pentru Poză (Placeholder dacă nu o putem descărca ușor în demo)
                        // Notă: Pentru a pune poza reală, trebuie descărcată ca byte[] din URL înainte.
                        // Aici punem un placeholder vizual.
                        row.ConstantItem(120).Height(150).Background(Colors.Grey.Lighten3).AlignMiddle().AlignCenter().Text("MUGSHOT").FontColor(Colors.Grey.Darken2);
                    });

                    col.Item().PaddingVertical(20).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);

                    // Tabel Sightings
                    col.Item().Text("SURVEILLANCE LOG").FontSize(14).Bold();

                    col.Item().Table(table =>
                    {
                        // Definiție Coloane
                        table.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(100); // Data
                            columns.ConstantColumn(100); // Agent
                            columns.RelativeColumn();    // Detalii
                            columns.ConstantColumn(120); // Coordonate
                        });

                        // Header Tabel
                        table.Header(header =>
                        {
                            header.Cell().Element(CellStyle).Text("TIMESTAMP");
                            header.Cell().Element(CellStyle).Text("AGENT");
                            header.Cell().Element(CellStyle).Text("DETAILS");
                            header.Cell().Element(CellStyle).Text("COORDS");

                            static IContainer CellStyle(IContainer container) => 
                                container.Background(Colors.Grey.Lighten3).Padding(5).BorderBottom(1).BorderColor(Colors.Black);
                        });

                        // Date Tabel
                        foreach (var log in data.Sightings)
                        {
                            table.Cell().Element(CellStyle).Text(log.Time.ToString("yyyy-MM-dd HH:mm"));
                            table.Cell().Element(CellStyle).Text(log.ReportedBy);
                            table.Cell().Element(CellStyle).Text(log.Details);
                            table.Cell().Element(CellStyle).Text($"{log.Lat:F4}, {log.Lng:F4}");
                        }
                        
                        static IContainer CellStyle(IContainer container) => 
                            container.BorderBottom(1).BorderColor(Colors.Grey.Lighten3).Padding(5);
                    });
                });

                // 3. FOOTER
                page.Footer().AlignCenter().Text(x =>
                {
                    x.Span("Page ");
                    x.CurrentPageNumber();
                    x.Span(" | CONFIDENTIAL DOCUMENT | DO NOT DISTRIBUTE");
                });
            });
        })
        .GeneratePdf();
    }
}