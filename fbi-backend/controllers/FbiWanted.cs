using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims; // <--- Nu uita asta!

using FbiApi.Models; // Asigură-te că faci using la DTO
using FbiApi.Services;
using FbiApi.Utils;
using FbiApi.Mappers;


[ApiController]
[Route("api/[controller]")]
public class FbiWanted : ControllerBase {
    private readonly IWantedPersonsService _service;

    public FbiWanted(IWantedPersonsService service)
    {
        _service = service;
    }

    [HttpGet]
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async Task<ActionResult<ApiResponse<PaginatedResponse<WantedPersonSummaryResponse>>>> GetAll(
        [FromQuery] PaginatedQueryDto paginatedQueryDto
    )
    {
        var result = await _service.GetAllAsync(paginatedQueryDto);
        if (result.Success == false) 
        {
            return BadRequest(ApiResponse<PaginatedResponse<WantedPersonSummaryResponse>>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<PaginatedResponse<WantedPersonSummaryResponse>>.Success(result.Data));
    }

    [HttpGet("{id}")]
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async Task< ActionResult<ApiResponse<WantedPersonDetailResponse>>> GetById(int id)
    {
        var person = await _service.GetByIdAsync(id);

        if (person.Success == false)
        {
            return NotFound(ApiResponse<WantedPersonDetailResponse>.Error(person.ErrorMessage));
        }

        return Ok(ApiResponse<WantedPersonDetailResponse>.Success(person.Data));
    }

    [HttpPost("{personId}/{save}")]
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async Task<ActionResult<ApiResponse<OperationStatus>>> OperationStatus(int personId, bool save) {
         var keycloakId = User.FindFirstValue(ClaimTypes.NameIdentifier);    
         if (string.IsNullOrEmpty(keycloakId))
         {
            return Unauthorized(ApiResponse<OperationStatus>.Error("Utilizatorul nu a putut fi identificat."));
         }
         var username = User.FindFirstValue("preferred_username");

         var result = await _service.SavePersonToFavourite(personId, username, keycloakId, save);
         if (result.Success == false)
         {
            return BadRequest(ApiResponse<OperationStatus>.Error(result.ErrorMessage));
         }
         return Ok(ApiResponse<OperationStatus>.Success(result.Data));
    }

    [HttpGet("saved")]
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async 
    Task<ActionResult<ApiResponse<PaginatedResponse<WantedPersonSummaryResponse>>>> getSavedWantedPersons(
        [FromQuery] PaginatedQueryDto paginatedQueryDto
    ) {
        var keycloakId = User.FindFirstValue(ClaimTypes.NameIdentifier);    
        if (string.IsNullOrEmpty(keycloakId))
        {
        return Unauthorized(ApiResponse<OperationStatus>.Error("Utilizatorul nu a putut fi identificat."));
        }
        var result = await _service.GetAllSavedAsync(paginatedQueryDto, keycloakId);
        if (result.Success == false) 
        {
            return BadRequest(ApiResponse<PaginatedResponse<WantedPersonSummaryResponse>>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<PaginatedResponse<WantedPersonSummaryResponse>>.Success(result.Data));
    }

    [HttpPost("report-location")]
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async 
    Task<ActionResult<ApiResponse<OperationStatus>>> reportLocation(
        ReportLocationRequest reportLocationRequest
    ) {
        var keycloakId = User.FindFirstValue(ClaimTypes.NameIdentifier);    
        if (string.IsNullOrEmpty(keycloakId))
        {
            return Unauthorized(ApiResponse<OperationStatus>.Error("Utilizatorul nu a putut fi identificat."));
        }
        var username = User.FindFirstValue("preferred_username");
        var result = await _service.reportLocation(reportLocationRequest, keycloakId, username);
        if (result.Success == false) 
        {
            return BadRequest(ApiResponse<OperationStatus>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<OperationStatus>.Success(result.Data));
    }

    [HttpGet("{id}/sightings")]
    
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async Task<ActionResult<ApiResponse<List<LocationReportDto>>>> GetSightings(int id)
    {
        var result = await _service.GetSightings(id);
        if (result.Success == false) 
        {
            return BadRequest(ApiResponse<List<LocationReportDto>>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<List<LocationReportDto>>.Success(result.Data));
    }

    [HttpGet("{id}/dossier")]
    
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async Task<ActionResult> DownloadDossier(int id)
    {
        var result = await _service.DownloadDossier(id);
         if (result.Success == false) 
        {
            return BadRequest(result.ErrorMessage);
        }
        return File(result.Data.bytes, "application/pdf", result.Data.fileName);
    }

    [HttpGet("stats")]
    [Authorize(Roles = $"{nameof(Role.ADMIN)}")]
    public async Task<ActionResult<DashboardStatsDto>> GenerateStats() {
        
        var result = await _service.GenerateStats();
         if (result.Success == false) 
        {
            return BadRequest(ApiResponse<DashboardStatsDto>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<DashboardStatsDto>.Success(result.Data));
    }

    [HttpGet("reports")]
    [Authorize(Roles = $"{nameof(Role.ADMIN)}")]
    public async Task<ActionResult<ApiResponse<PaginatedResponse<ReportDto>>>> getAllReports(
        [FromQuery] PaginatedQueryDto paginatedQueryDto
    ) {
        var result = await _service.GetAllReportsAsync(paginatedQueryDto);
        if (result.Success == false) 
        {
            return BadRequest(ApiResponse<PaginatedResponse<ReportDto>>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<PaginatedResponse<ReportDto>>.Success(result.Data));
    }

}