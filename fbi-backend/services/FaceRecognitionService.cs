
using FbiApi.Data;
using FbiApi.Models;

namespace FbiApi.Services;

public class FaceRecognitionService : IFaceRecognitionService
{

    private readonly ILogger<FaceRecognitionService> _logger;
    private readonly AppDbContext _context;

    private readonly IConfiguration _configuration;

    private readonly string _faceRecognitionApiUrl;
    private readonly string _faceRecognitionApiKey;

    public FaceRecognitionService(IConfiguration configuration,
    ILogger<FaceRecognitionService> logger,
    AppDbContext context)
    {
        _configuration = configuration;
        _logger = logger;
        _context = context;
        _faceRecognitionApiUrl = _configuration["FaceRecognition:Url"] ?? "http://localhost:8006";
        _faceRecognitionApiKey = _configuration["FaceRecognition:ApiKey"] ?? "";
    }

    public async Task<ServiceResult<CheckImageFaceRecognitionResponse>> CheckImageFaceRecognitionMatch(string imageUrl)
    {
        using var client = new HttpClient();
        // Daca rulezi local (fara docker network) folosesti localhost
        // Daca rulezi in Docker, folosesti numele serviciului: http://ai_service:8000
        client.BaseAddress = new Uri(_faceRecognitionApiUrl);

        // 3. Adăugăm Header-ul de Securitate (X-FBI-Key)
        client.DefaultRequestHeaders.Add("X-FBI-Key", _faceRecognitionApiKey);

        var pythonRequestPayload = new 
        { 
            image_to_verify_url = imageUrl
        };

        try
        {
            // 4. Facem request-ul POST
            var response = await client.PostAsJsonAsync("/fast-search", pythonRequestPayload);

            if (response.IsSuccessStatusCode)
            {
                // 5. Deserializăm răspunsul JSON în DTO-ul tău
                var result = await response.Content.ReadFromJsonAsync<CheckImageFaceRecognitionResponse>();

                if (result != null && result.Matches.Count > 0)
                {
                     
                    // 🎉 AI GĂSIT POTRIVIRI!
                    foreach (var match in result.Matches)
                    {
                        Console.WriteLine($"Found suspect: {match.Url} with {match.Confidence}% confidence.");
                    }

                    return ServiceResult<CheckImageFaceRecognitionResponse>.Ok(result);
                       
                }
                else
                {
                    Console.WriteLine("No match found.");
                    return ServiceResult<CheckImageFaceRecognitionResponse>.Ok(result);
                }
            }
            else
            {
                // Log error from Python (ex: 400 Bad Request if download failed)
                var error = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"AI Error: {response.StatusCode} - {error}");
                return ServiceResult<CheckImageFaceRecognitionResponse>.Fail($"AI Error: {response.StatusCode} - {error}");
            }
        }
        catch (Exception ex)
        {
            return ServiceResult<CheckImageFaceRecognitionResponse>.Fail($"AI Error: {ex.Message}");
        }
    }
}