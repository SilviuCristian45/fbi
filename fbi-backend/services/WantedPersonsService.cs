namespace FbiApi.Services;

using FbiApi.Data;
using FbiApi.Models;
using FbiApi.Models.Entities;
using Microsoft.EntityFrameworkCore;
using FbiApi.Utils;
using FbiApi.Mappers;
using FbiApi.Hubs;
using Microsoft.AspNetCore.SignalR;
using FbiApi.Models;
using MassTransit;
using FbiApi.Contracts; // Pt mesaj

public class WantedPersonsService : IWantedPersonsService
{
    private readonly AppDbContext _context;
    private readonly IHubContext<SurveilanceHub> _hubContext;

    private readonly ILogger<WantedPersonsService> _logger;

    private readonly IFaceRecognitionService _faceRecognitionService;

    private readonly ISendEndpointProvider _sendEndpointProvider;

    private readonly IConfiguration _configuration;


    public WantedPersonsService(
        AppDbContext context, 
        IHubContext<SurveilanceHub> hubContext,
        ILogger<WantedPersonsService> logger,
        IFaceRecognitionService faceRecognitionService,
        ISendEndpointProvider sendEndpointProvider,
        IConfiguration configuration
    )
    {
        _configuration = configuration;
        _hubContext = hubContext;
        _context = context;
        _logger = logger;
        _faceRecognitionService = faceRecognitionService;
        _sendEndpointProvider = sendEndpointProvider;

    }

    public async Task<ServiceResult<OperationStatus>> SavePersonToFavourite(int personId,string username, string keycloakId, bool save) {
        try {
            if (save) {
                _context.SaveWantedPersons.Add(new SaveWantedPerson { UserId = keycloakId, WantedPersonId = personId } );
                await _hubContext.Clients.Group("Admins").SendAsync("ReceiveActivity", 
                    $"Agentul {username} a adăugat un suspect la favoriți!");
            } else {
                await _context.SaveWantedPersons
                .Where(x => x.UserId == keycloakId && x.WantedPersonId == personId)
                .ExecuteDeleteAsync();
            }
            await _context.SaveChangesAsync();
            return new OperationStatus(true);
        } catch (Exception e) {
            Console.WriteLine(e.Message);
            return new ServiceError(e.Message);
        }
    }

     public async Task<ServiceResult<PaginatedResponse<WantedPersonSummaryResponse>>> GetAllSavedAsync(PaginatedQueryDto paginatedQueryDto,
     string keycloakId
     )
    {

        string search = paginatedQueryDto.Search;
        int pageSize = paginatedQueryDto.PageSize;
        int page = paginatedQueryDto.PageNumber;

        var query = _context.WantedPersons
            .Include(p => p.Images)
            .Include(p => p.SaveWantedPersons)
            .Where(p => p.SaveWantedPersons != null && p.SaveWantedPersons.Select(q => q.UserId).Contains(keycloakId))
            .AsNoTracking() // Optimizare: Read-Only e mai rapid
            .AsQueryable();

        if (!string.IsNullOrEmpty(search))
        {
            search = search.ToLower();
            query = query.Where(p => 
                (p.Title != null && p.Title.ToLower().Contains(search)) || 
                (p.Description != null && p.Description.ToLower().Contains(search))
            );
        }

        var totalItems = await query.CountAsync();

        var items = await query
            .OrderByDescending(p => p.PublicationDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(); 

        var dtos = items.Select(p => p.ToSummaryDto()).ToList();

        return new PaginatedResponse<WantedPersonSummaryResponse>(totalItems, dtos);
    }



    public async Task<ServiceResult<PaginatedResponse<WantedPersonSummaryResponse>>> GetAllAsync(PaginatedQueryDto paginatedQueryDto)
    {

        string search = paginatedQueryDto.Search;
        int pageSize = paginatedQueryDto.PageSize;
        int page = paginatedQueryDto.PageNumber;

        var query = _context.WantedPersons
            .Include(p => p.Images) // Doar imaginile pt listare
            .AsNoTracking() // Optimizare: Read-Only e mai rapid
            .AsQueryable();

        if (!string.IsNullOrEmpty(search))
        {
            search = search.ToLower();
            query = query.Where(p => 
                (p.Title != null && p.Title.ToLower().Contains(search)) || 
                (p.Description != null && p.Description.ToLower().Contains(search))
            );
        }

        var totalItems = await query.CountAsync();

        var items = await query
            .OrderByDescending(p => p.PublicationDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(); 

        var dtos = items.Select(p => p.ToSummaryDto()).ToList();

        return new PaginatedResponse<WantedPersonSummaryResponse>(totalItems, dtos);
    }

   public async Task<ServiceResult<WantedPersonDetailResponse>> GetByIdAsync(int id)
    {
        var person = await _context.WantedPersons
           .Include(p => p.Images)
            .Include(p => p.Aliases)
            .Include(p => p.Files)
            .Include(p => p.Subjects)
            // 2. Optimizare (Doar citim, nu modificăm)
            .AsNoTracking() 
            .FirstOrDefaultAsync(p => p.Id == id);

        if (person == null)
        {
            return new ServiceError("Not found person");
        }

        return WantedPersonMappers.ToDetailDto(person);
    }

    public async Task<ServiceResult<OperationStatus>> reportLocation(ReportLocationRequest reportLocationRequest, string userId, string username) {
        
        try {
            var location = _context.LocationWantedPersons.Add(new LocationWantedPerson {
                Latitude = reportLocationRequest.Lat,
                Longitude = reportLocationRequest.Lng,
                Description = reportLocationRequest.Details,
                WantedPersonId = reportLocationRequest.WantedId,
                UserId = userId,
                Username = username,
                ReportedAt = DateTime.UtcNow,
                FileUrl = reportLocationRequest.FileUrl,
            });

            await _context.SaveChangesAsync();

            var sightingDto = new {
                id = location.Entity.Id,
                lat = location.Entity.Latitude,
                lng = location.Entity.Longitude,
                details = location.Entity.Description,
                reportedBy = location.Entity.Username,
                timestamp = location.Entity.ReportedAt,
                wantedPersonId = location.Entity.WantedPersonId,
                fileUrl = location.Entity.FileUrl,
            };

            await _hubContext.Clients.All.SendAsync("ReceiveLocation", sightingDto);

            // ServiceResult<CheckImageFaceRecognitionResponse> result = await _faceRecognitionService.CheckImageFaceRecognitionMatch(reportLocationRequest.FileUrl);

            // if (result.Success == false) {
            //     _logger.LogWarning("error when checking face recognition in system");
            //     _logger.LogError(result.ErrorMessage);
            // } else {
            //     foreach(var person in result.Data.Matches) {
            //         await _context.PersonMatchResults.AddAsync(new PersonMatchResults() {
            //             ImageUrl = person.Url,
            //             Confidence = person.Confidence,
            //             LocationWantedPersonId = location.Entity.Id
            //         });
            //     }
            // }

            // await _publishEndpoint.Publish(new AnalyzeFaceMessage
            // {
            //     answers = result.Data.Matches.Select(it -> new AnalyzeFaceMessageResponse() {

            //     })
            // });

            // await _context.SaveChangesAsync();

            var queueName = _configuration["RabbitMq:Queue"];
            var uri = queueName.StartsWith("queue:") ? new Uri($"{queueName}") : new Uri($"queue:{queueName}");
            var endpoint = await _sendEndpointProvider.GetSendEndpoint(uri);
    
            // Trimite comanda
            await endpoint.Send(new AnalyzeFaceCommand { 
                ReportId = location.Entity.Id, 
                ImageUrl = reportLocationRequest.FileUrl 
            });


            return new OperationStatus(true);
        } catch(Exception e) {
            _logger.LogError(e.Message);
            return new OperationStatus(false);
        }
    }

     public async Task<ServiceResult<List<LocationReportDto>>> GetSightings(int id) {
        try {
            var reports = await _context.LocationWantedPersons // Presupun ca ai tabela asta
                .Where(r => r.WantedPersonId == id)
                .OrderByDescending(r => r.ReportedAt)
                .Select(r => new LocationReportDto(r.Id, r.Latitude, r.Longitude, r.Description, r.Username, r.ReportedAt, r.WantedPersonId, r.FileUrl))
                .ToListAsync();
            return reports;
        } catch(Exception e) {
            _logger.LogError(e.Message);
            return new List<LocationReportDto>();
        }
     } 

     public async Task<ServiceResult<DownloadDossierDto>> DownloadDossier(int id) {
        // 1. Căutăm suspectul
        try {
            var wanted = await _context.WantedPersons.FindAsync(id);
            if (wanted == null) return ServiceResult<DownloadDossierDto>.Fail("not found wanted person");

            // 2. Căutăm locațiile (sightings)
            var sightings = await _context.LocationWantedPersons
                .Where(x => x.WantedPersonId == id)
                .OrderByDescending(x => x.ReportedAt)
                .Take(20) // Luăm ultimele 20
                .ToListAsync();

            // 3. Pregătim datele pentru PDF
            var pdfData = new PdfGenerator.PdfData(
                Name: wanted.Title,
                Description: wanted.Description,
                ImageUrl: wanted.Images.FirstOrDefault()?.LargeUrl,
                Sightings: wanted.LocationWantedPersons.Select(s => new PdfGenerator.PdfSighting(
                    s.Username, s.ReportedAt, s.Description, s.Latitude, s.Longitude
                )).ToList()
            );

            // 4. Generăm fișierul (Bytes)
            var fileBytes = PdfGenerator.GenerateDossier(pdfData);
            var fileName = $"CASE_FILE_{wanted.Title.Replace(" ", "_").ToUpper()}.pdf";

            // 5. Returnăm ca fișier descărcabil
            //return File(fileBytes, "application/pdf", fileName);
            return new DownloadDossierDto(fileBytes, fileName);
        } catch (Exception ex) {
            _logger.LogError(ex.Message);
            return ServiceResult<DownloadDossierDto>.Fail(ex.Message);
        }
     }

    public async Task<ServiceResult<DashboardStatsDto>> GenerateStats() {
        try {
            var totalSuspects = await _context.WantedPersons.CountAsync();
            var totalSightings = await _context.LocationWantedPersons.CountAsync();

            var sevenDaysAgo = DateTime.UtcNow.AddDays(-7);

            var activityData = await _context.LocationWantedPersons
                .Where(x => x.ReportedAt >= sevenDaysAgo)
                .GroupBy(x => x.ReportedAt.Date)
                .Select(g => new 
                {
                    Date = g.Key,
                    Count = g.Count()
                })
                .OrderBy(x => x.Date)
                .ToListAsync();

            var formattedActivity = activityData.Select(x => new ChartDataPoint 
            {
                Date = x.Date.ToString("dd MMM"),
                Count = x.Count
            }).ToList();

            var topSuspects = await _context.WantedPersons
                .Select(p => new TopSuspectDto
                {
                    Name = p.Title,
                    SightingsCount = _context.LocationWantedPersons.Count(l => l.WantedPersonId == p.Id)
                })
                .OrderByDescending(x => x.SightingsCount)
                .Take(5)
                .ToListAsync();

            // 4. Construim răspunsul final
            var stats = new DashboardStatsDto
            {
                TotalSuspects = totalSuspects,
                TotalSightings = totalSightings,
                ActivityLast7Days = formattedActivity,
                TopSuspects = topSuspects
            };

            return ServiceResult<DashboardStatsDto>.Ok(stats);
        } catch(Exception exception) {
            _logger.LogError(exception.Message);
            return ServiceResult<DashboardStatsDto>.Fail(exception.Message);
        }
    } 

    public async Task<ServiceResult<PaginatedResponse<ReportDto>>> GetAllReportsAsync(
        PaginatedQueryDto paginatedQueryDto
    ) {
        string search = paginatedQueryDto.Search;
        int pageSize = paginatedQueryDto.PageSize;
        int page = paginatedQueryDto.PageNumber;
        try {   
            var query = _context.LocationWantedPersons
            .Include(p => p.personMatchResults)
            .Include(p => p.WantedPerson)
            .AsNoTracking() // Optimizare: Read-Only e mai rapid
            .AsQueryable();

        if (!string.IsNullOrEmpty(search))
        {
            search = search.ToLower();
            query = query.Where(p => 
                (p.Description != null && p.Description.ToLower().Contains(search)) || 
                (p.Username != null && p.Username.ToLower().Contains(search))
            );
        }

        var totalItems = await query.CountAsync();

        var items = await query
            .OrderByDescending(p => p.ReportedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(); 

        var dtos = items.Select(p => p.toReportDto()).ToList();

        return new PaginatedResponse<ReportDto>(totalItems, dtos);
        } catch (Exception ex) {
            return ServiceResult<PaginatedResponse<ReportDto>>.Fail(ex.Message);
        }
    }
}