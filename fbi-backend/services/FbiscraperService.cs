using System.Text.Json;
using FbiApi.Data;
using FbiApi.Models.Entities;
using FbiApi.Models; // Aici sunt DTO-urile (Records)
using Microsoft.EntityFrameworkCore;

namespace FbiApi.Services;

public class FbiScraperService : BackgroundService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FbiScraperService> _logger;

    // Rulăm o dată la 24 de ore
    private readonly TimeSpan _period = TimeSpan.FromHours(24); 

    public FbiScraperService(
        IHttpClientFactory httpClientFactory,
        IServiceProvider serviceProvider,
        ILogger<FbiScraperService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Timer care ticăie la intervalul setat
        using var timer = new PeriodicTimer(_period);

        // Rulăm imediat prima dată
        //await FetchAndSaveFbiData(stoppingToken);

        // Apoi așteptăm următoarele cicluri
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await FetchAndSaveFbiData(stoppingToken);
        }
    }


private async Task FetchAndSaveFbiData(CancellationToken stoppingToken)
    {
        try
        {
            _logger.LogInformation("--- Începe sincronizarea cu FBI API ---");

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("User-Agent", "MyDemoApp/1.0 (contact@example.com)");

            int page = 1;
            bool hasMoreData = true;

            // 🔄 Începem bucla de paginare
            while (hasMoreData && !stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation($"Descarc pagina {page}...");

                // 1. APELUL HTTP CU PARAMETRUL PAGE
                var response = await client.GetAsync($"https://api.fbi.gov/wanted/v1/list?page={page}", stoppingToken);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError($"Eroare la apelul FBI (Pagina {page}): {response.StatusCode}");
                    break; // Ne oprim dacă dă eroare
                }

                var fbiData = await response.Content.ReadFromJsonAsync<FbiResponse>(cancellationToken: stoppingToken);

                // 2. CONDIȚIA DE OPRIRE
                // Dacă lista de items e goală sau null, înseamnă că am terminat toate paginile
                if (fbiData == null || fbiData.Items == null || fbiData.Items.Count == 0)
                {
                    _logger.LogInformation("Nu mai sunt date. Sincronizare completă.");
                    hasMoreData = false;
                    break;
                }

                // 3. SALVAREA PENTRU PAGINA CURENTĂ
                using (var scope = _serviceProvider.CreateScope())
                {
                    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                    foreach (var itemDto in fbiData.Items)
                    {
                        var existingPerson = await context.WantedPersons
                            .Include(p => p.Images)
                            .FirstOrDefaultAsync(p => p.ExternalId == itemDto.Uid, stoppingToken);

                        if (existingPerson == null)
                        {
                            var newPerson = new WantedPerson
                            {
                                ExternalId = itemDto.Uid,
                                PathId = itemDto.PathId,
                                Title = itemDto.Title,
                                Description = itemDto.Description,
                                Details = itemDto.Details,
                                Caution = itemDto.Caution,
                                RewardText = itemDto.RewardText,
                                RewardMin = itemDto.RewardMin,
                                RewardMax = itemDto.RewardMax,
                                Sex = itemDto.Sex,
                                Race = itemDto.Race,
                                Hair = itemDto.Hair,
                                Eyes = itemDto.Eyes,
                                PublicationDate = itemDto.Publication,
                                ModifiedDate = itemDto.Modified,
                                Status = itemDto.Status,
                                Ncic = itemDto.Ncic
                            };

                            if (itemDto.Images != null)
                            {
                                foreach (var img in itemDto.Images)
                                {
                                    newPerson.Images.Add(new WantedImage
                                    {
                                        OriginalUrl = img.Original,
                                        LargeUrl = img.Large,
                                        Caption = img.Caption
                                    });
                                }
                            }

                            if (itemDto.Aliases != null)
                            {
                                foreach (var alias in itemDto.Aliases)
                                {
                                    newPerson.Aliases.Add(new WantedAlias { Name = alias });
                                }
                            }

                            if (itemDto.Subjects != null)
                            {
                                foreach (var subject in itemDto.Subjects)
                                {
                                    newPerson.Subjects.Add(new WantedSubject { Name = subject });
                                }
                            }

                            context.WantedPersons.Add(newPerson);
                        }
                        else
                        {
                            existingPerson.ModifiedDate = DateTime.UtcNow;
                            existingPerson.Status = itemDto.Status;
                        }
                    }

                    await context.SaveChangesAsync(stoppingToken);
                    _logger.LogInformation($"Salvat pagina {page} ({fbiData.Items.Count} items).");
                }

                // 4. PREGĂTIRE PENTRU URMĂTOAREA PAGINĂ
                page++;

                // O mică pauză să nu supărăm API-ul (Rate Limiting)
                await Task.Delay(500, stoppingToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "A crăpat Scraper-ul FBI!");
        }
    }

    // private async Task FetchAndSaveFbiData(CancellationToken stoppingToken)
    // {
    //     try
    //     {
    //         _logger.LogInformation("--- Începe sincronizarea cu FBI API ---");

    //         // 1. PREGĂTIRE CLIENT HTTP
    //         var client = _httpClientFactory.CreateClient();
            
    //         // IMPORTANT: FBI blochează request-urile fără User-Agent (cred că ești bot)
    //         client.DefaultRequestHeaders.Add("User-Agent", "MyDemoApp/1.0 (contact@example.com)");

    //         // 2. APELUL HTTP (GET)
    //         // Luăm doar prima pagină pentru simplitate. API-ul are paginare (?page=2)
    //         var response = await client.GetAsync("https://api.fbi.gov/wanted/v1/list", stoppingToken);

    //         if (!response.IsSuccessStatusCode)
    //         {
    //             _logger.LogError($"Eroare la apelul FBI: {response.StatusCode}");
    //             return;
    //         }

    //         // 3. DESERIALIZARE (JSON -> DTO Record)
    //         // Folosim ReadFromJsonAsync care face stream direct (eficient)
    //         var fbiData = await response.Content.ReadFromJsonAsync<FbiResponse>(cancellationToken: stoppingToken);

    //         if (fbiData == null || fbiData.Items == null)
    //         {
    //             _logger.LogWarning("Nu s-au găsit date în răspunsul JSON.");
    //             return;
    //         }

    //         // 4. SALVARE ÎN BAZA DE DATE
    //         // Fiind într-un Singleton (BackgroundService), trebuie să creăm un Scope manual pentru DbContext
    //         using (var scope = _serviceProvider.CreateScope())
    //         {
    //             var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    //             foreach (var itemDto in fbiData.Items)
    //             {
    //                 // Verificăm dacă există deja (ca să nu îl dublăm)
    //                 var existingPerson = await context.WantedPersons
    //                     .Include(p => p.Images) // Include relațiile dacă vrei să le verifici
    //                     .FirstOrDefaultAsync(p => p.ExternalId == itemDto.Uid, stoppingToken);

    //                 if (existingPerson == null)
    //                 {
    //                     // --- MAPARE: DTO (Record) -> ENTITY (Class) ---
    //                     var newPerson = new WantedPerson
    //                     {
    //                         ExternalId = itemDto.Uid,
    //                         PathId = itemDto.PathId,
    //                         Title = itemDto.Title,
    //                         Description = itemDto.Description,
    //                         Details = itemDto.Details,
    //                         Caution = itemDto.Caution,
    //                         RewardText = itemDto.RewardText,
    //                         RewardMin = itemDto.RewardMin,
    //                         RewardMax = itemDto.RewardMax,
    //                         Sex = itemDto.Sex,
    //                         Race = itemDto.Race,
    //                         Hair = itemDto.Hair,
    //                         Eyes = itemDto.Eyes,
    //                         PublicationDate = itemDto.Publication,
    //                         ModifiedDate = itemDto.Modified,
    //                         Status = itemDto.Status,
    //                         Ncic = itemDto.Ncic
    //                     };

    //                     // A. Mapare Imagini (List -> Table)
    //                     if (itemDto.Images != null)
    //                     {
    //                         foreach (var img in itemDto.Images)
    //                         {
    //                             newPerson.Images.Add(new WantedImage
    //                             {
    //                                 OriginalUrl = img.Original,
    //                                 LargeUrl = img.Large,
    //                                 Caption = img.Caption
    //                             });
    //                         }
    //                     }

    //                     // B. Mapare Alias-uri (List<string> -> Table)
    //                     if (itemDto.Aliases != null)
    //                     {
    //                         foreach (var alias in itemDto.Aliases)
    //                         {
    //                             newPerson.Aliases.Add(new WantedAlias { Name = alias });
    //                         }
    //                     }

    //                     // C. Mapare Categorii (List<string> -> Table)
    //                     if (itemDto.Subjects != null)
    //                     {
    //                         foreach (var subject in itemDto.Subjects)
    //                         {
    //                             newPerson.Subjects.Add(new WantedSubject { Name = subject });
    //                         }
    //                     }

    //                     context.WantedPersons.Add(newPerson);
    //                 }
    //                 else
    //                 {
    //                     // UPDATE LOGIC (Opțional)
    //                     // Dacă persoana există, poate actualizăm statusul sau recompensa
    //                     existingPerson.ModifiedDate = DateTime.UtcNow;
    //                     existingPerson.Status = itemDto.Status;
    //                 }
    //             }

    //             await context.SaveChangesAsync(stoppingToken);
    //             _logger.LogInformation($"S-au procesat {fbiData.Items.Count} înregistrări.");
    //         }
    //     }
    //     catch (Exception ex)
    //     {
    //         _logger.LogError(ex, "A crăpat Scraper-ul FBI!");
    //     }
    // }
}