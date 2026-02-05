namespace FbiApi.Services;

using FbiApi.Models;

public interface IUsersService
{
    public Task<ServiceResult<SetUserLocation>> setUserLocation(string userId, SetUserLocationRequest setUserLocation);
    public Task<ServiceResult<GetUserLocation>> getUserLocation(string userId);
}