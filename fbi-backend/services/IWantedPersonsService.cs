using FbiApi.Models; // Pt PagedResult
using FbiApi.Models.Entities;
using FbiApi.Utils;
using Microsoft.AspNetCore.Mvc; // <--- Asta conține metoda 'File'
namespace FbiApi.Services;

public interface IWantedPersonsService
{
    Task<ServiceResult<PaginatedResponse<WantedPersonSummaryResponse>>> GetAllAsync(PaginatedQueryDto paginatedQueryDto);
    
     Task<ServiceResult<PaginatedResponse<WantedPersonSummaryResponse>>> GetAllSavedAsync(PaginatedQueryDto paginatedQueryDto, string keycloakId);

    Task<ServiceResult<WantedPersonDetailResponse?>> GetByIdAsync(int id);

    Task<ServiceResult<OperationStatus>> SavePersonToFavourite(int personId, string username, string keycloakId, bool save);

    Task<ServiceResult<OperationStatus>> reportLocation(ReportLocationRequest reportLocationRequest,  string userId, string username);

    Task<ServiceResult<List<LocationReportDto>>> GetSightings(int id);

    Task<ServiceResult<DownloadDossierDto>> DownloadDossier(int id);

    Task<ServiceResult<DashboardStatsDto>> GenerateStats();

    Task<ServiceResult<PaginatedResponse<ReportDto>>> GetAllReportsAsync(
        PaginatedQueryDto paginatedQueryDto
    );
}