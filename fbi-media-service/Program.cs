using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Transfer;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

// 1. CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        policy => policy.AllowAnyOrigin()
                        .AllowAnyMethod()
                        .AllowAnyHeader());
});



// 2. Configurare MinIO Client (Dinamic din Configurare)
builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    
    // Citim din secrets.json / appsettings.json / Environment Variables
    var minioUrl = config["Minio:Url"] ?? "https://localhost:9000"; // Fallback
    var accessKey = config["Minio:AccessKey"] ?? "minio-image";
    var secretKey = config["Minio:SecretKey"] ?? "minio-image-pass";

    var s3Config = new AmazonS3Config
    {
        ServiceURL = minioUrl,
        ForcePathStyle = true, // Obligatoriu pt MinIO
    };

    // 🔥 LOGICĂ DINAMICĂ: Activăm bypass SSL doar dacă URL-ul este HTTPS
    if (minioUrl.StartsWith("https", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine($"[MinIO] HTTPS detectat pe {minioUrl}. Activăm InsecureHttpClientFactory pentru self-signed certs.");
        s3Config.HttpClientFactory = new InsecureHttpClientFactory();
    }
    else
    {
        Console.WriteLine($"[MinIO] HTTP detectat pe {minioUrl}. Folosim client standard.");
        s3Config.UseHttp = true;
    }

    return new AmazonS3Client(accessKey, secretKey, s3Config);
});

var app = builder.Build();
app.UseCors("AllowAll");

// 👇 --- START SECURITY MIDDLEWARE --- 👇
app.Use(async (context, next) =>
{
    // Verificăm doar rutele care încep cu /upload
    if (context.Request.Path.StartsWithSegments("/upload"))
    {
        // 1. Căutăm header-ul X-Api-Key
        if (!context.Request.Headers.TryGetValue("X-Api-Key", out var extractedApiKey))
        {
            context.Response.StatusCode = 401; // Unauthorized
            await context.Response.WriteAsync("API Key missing. Access Denied. 👮‍♂️");
            return;
        }

        // 2. Verificăm dacă se potrivește cu ce avem în Configurare
        var config = context.RequestServices.GetRequiredService<IConfiguration>();
        var validApiKey = config["ApiKey"];

        if (!string.Equals(extractedApiKey, validApiKey)) // Comparație simplă
        {
            context.Response.StatusCode = 403; // Forbidden
            await context.Response.WriteAsync("Invalid API Key. 🚫");
            return;
        }
    }

    // Dacă totul e ok, mergem mai departe la endpoint-ul real
    await next();
});


var appPort = app.Configuration["AppPort"] ?? "7005";

// Healthcheck pentru Docker (nu e rutat public prin nginx)
app.MapGet("/health", () => Results.Ok("ok"));

// 3. Endpoint Upload
app.MapPost("/upload", async (IFormFile file, IAmazonS3 s3Client, IConfiguration config) =>
{
    if (file == null || file.Length == 0) 
        return Results.BadRequest("Fisier invalid.");

    var bucketName = config["Minio:Bucketname"] ?? "bucket-noname";
    var fileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
    var port = config["Port"] ?? "7005";

    try 
    {
        // Verificăm/Creăm bucket
        var buckets = await s3Client.ListBucketsAsync();
        // Verificăm dacă lista e null înainte să apelăm Any()
bool bucketExists = buckets.Buckets != null && buckets.Buckets.Any(b => b.BucketName == bucketName);
        if (!bucketExists) // Doar la creare
        {
            await s3Client.PutBucketAsync(bucketName);
            Console.WriteLine($"Bucket '{bucketName}' creat.");
             // Această structură JSON spune: 
             // "Permite (Allow) oricui (Principal *) să citească (s3:GetObject) orice din acest bucket"
            string policy = $@"{{
                ""Version"": ""2012-10-17"",
                ""Statement"": [{{
                    ""Effect"": ""Allow"",
                    ""Principal"": {{""AWS"": ""*""}},
                    ""Action"": [""s3:GetObject""],
                    ""Resource"": [""arn:aws:s3:::{bucketName}/*""]
                }}]
            }}";
            
            await s3Client.PutBucketPolicyAsync(bucketName, policy);
            Console.WriteLine($"Policy PUBLIC aplicat pe bucket-ul {bucketName}");
        }

        // Upload
        using var stream = file.OpenReadStream();
        var uploadRequest = new TransferUtilityUploadRequest
        {
            InputStream = stream,
            Key = fileName,
            BucketName = bucketName,
            CannedACL = S3CannedACL.PublicRead
        };

        var fileTransferUtility = new TransferUtility(s3Client);
        await fileTransferUtility.UploadAsync(uploadRequest);
        var publicBaseUrl = config["Minio:PublicUrl"] ?? config["Minio:Url"] ?? "http://localhost:9000";
        
        // Curatam slash-ul de la final ca sa nu avem dubluri
        publicBaseUrl = publicBaseUrl.TrimEnd('/');
        
        var finalUrl = $"{publicBaseUrl}/{bucketName}/{fileName}";
        
        return Results.Ok(new { Url = finalUrl });
    }
    catch (Exception ex)
    {
        return Results.Problem($"EROARE MINIO: {ex.Message} \n {ex.InnerException?.Message}");
    }
})
.DisableAntiforgery();

Console.WriteLine("Media Microservice running on port 7005 📸");
// Semnul "*" spune: "Asculta pe orice IP disponibil"
app.Run($"http://*:{appPort}");


// ---------------------------------------------------------
// CLASA AJUTĂTOARE PENTRU BYPASS SSL
// ---------------------------------------------------------
public class InsecureHttpClientFactory : Amazon.Runtime.HttpClientFactory
{
    public override HttpClient CreateHttpClient(IClientConfig clientConfig)
    {
        var handler = new HttpClientHandler
        {
            // Ignoră erorile de certificat doar pentru acest client
            ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true
        };

        return new HttpClient(handler);
    }
}