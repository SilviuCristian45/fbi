using FbiApi.Models; // Pt LoginRequest, LoginResponse, ApiResponse
using FbiApi.Utils;

namespace FbiApi.Services;

public interface IAuthService
{
    Task<ApiResponse<LoginResponse>> LoginAsync(LoginRequest request);
    Task<ServiceResult<string>> RegisterAsync(RegisterRequest request);

    Task<PaginatedResponse<UserResponse>> GetAllUsers(PaginatedQueryDto paginatedQueryDto);
    
}