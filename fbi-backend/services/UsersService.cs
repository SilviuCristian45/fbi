namespace FbiApi.Services;

using FbiApi.Models;
using FbiApi.Models.Entities;
using FbiApi.Data;
using Microsoft.EntityFrameworkCore;

public class UsersService: IUsersService {

    private readonly AppDbContext _context;
     private readonly ILogger<UsersService> _logger;

    public UsersService(
        AppDbContext context, 
        ILogger<UsersService> logger
    ) {
        _context = context;
        _logger = logger;
    }

    public async Task<ServiceResult<GetUserLocation>> getUserLocation(string userId) {
        try {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            return ServiceResult<GetUserLocation>.Ok(
                new GetUserLocation(user.Latitude, user.Longitude)
            );
        } catch (Exception ex) {
            _logger.LogError(ex.Message);
            return ServiceResult<GetUserLocation>.Fail(ex.Message);
        }
    }

    public async Task<ServiceResult<SetUserLocation>> setUserLocation(string userId, SetUserLocationRequest setUserLocation) {
        try {
           double latitude = setUserLocation.latitude;
           double longitude = setUserLocation.longitude;

           var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId);

            if (user == null) 
            {
                user = new User 
                {
                    UserId = userId, // Setăm ID-ul din token (Keycloak)
                    Latitude = (decimal)latitude,
                    Longitude = (decimal)longitude
                };

                // Îl adăugăm în lista de tracking a EF Core ca "Added"
                await _context.Users.AddAsync(user);
            }

            // 2. Modificăm proprietățile
            // Facem cast la (decimal) pentru că entitatea ta cere decimal
            user.Latitude = (decimal)latitude;
            user.Longitude = (decimal)longitude;

            await _context.SaveChangesAsync();

            var resultData = new SetUserLocation(true);

            return ServiceResult<SetUserLocation>.Ok(resultData);
        } catch(Exception ex) {
            _logger.LogError(ex.Message);
            return ServiceResult<SetUserLocation>.Fail(ex.Message);
        }
    }

}