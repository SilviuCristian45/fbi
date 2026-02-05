namespace FbiApi.Services;

using FbiApi.Models;

public interface IUsersService
{
    public Task<ServiceResult<SetUserLocation>> setUserLocation(string userId, SetUserLocationRequest setUserLocation);
}