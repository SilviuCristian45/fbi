using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims; // <--- Nu uita asta!

using FbiApi.Models; // Asigură-te că faci using la DTO
using FbiApi.Services;
using FbiApi.Utils;
using FbiApi.Mappers;


[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase {

    private readonly IUsersService _service;


    public UsersController(IUsersService service)
    {
        _service = service;
    }

    [HttpGet]
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async Task<ActionResult<ApiResponse<GetUserLocation>>> GetUserLocation()
    {
        var keycloakId = User.FindFirstValue(ClaimTypes.NameIdentifier);    
         if (string.IsNullOrEmpty(keycloakId))
         {
            return Unauthorized(ApiResponse<GetUserLocation>.Error("Utilizatorul nu a putut fi identificat."));
         }
        var result = await _service.getUserLocation(keycloakId);
        if (result.Success == false) 
        {
            return BadRequest(ApiResponse<GetUserLocation>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<GetUserLocation>.Success(result.Data));
    }


    [HttpPost]
    [Authorize(Roles = $"{nameof(Role.USER)},{nameof(Role.ADMIN)}")]
    public async Task<ActionResult<ApiResponse<string>>> SetUserLocation(
        [FromBody] SetUserLocationRequest setUserLocationRequest
    )
    {
        var keycloakId = User.FindFirstValue(ClaimTypes.NameIdentifier);    
         if (string.IsNullOrEmpty(keycloakId))
         {
            return Unauthorized(ApiResponse<string>.Error("Utilizatorul nu a putut fi identificat."));
         }
        var result = await _service.setUserLocation(keycloakId, setUserLocationRequest);
        if (result.Success == false) 
        {
            return BadRequest(ApiResponse<string>.Error(result.ErrorMessage));
        }
        return Ok(ApiResponse<string>.Success("locatie trimisa cu succes"));
    }
}