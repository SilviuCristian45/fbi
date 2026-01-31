using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using FbiApi.Utils;
using System.Security.Claims; // <--- OBLIGATORIU
using System.Text.Json;       // <--- OBLIGATORIU
using FluentValidation;
using FluentValidation.AspNetCore;
using Stripe;
using Supabase;
using System.Text.Json.Serialization; // <--- Adaugă namespace-ul
using QuestPDF.Infrastructure;
using MassTransit; // Nu uita using-ul
using FbiApi.Consumers;

using Microsoft.AspNetCore.Mvc; // Pt ApiBehaviorOptions
using FbiApi.Models; // Pt ApiResponse
using FbiApi.Hubs;
using FbiApi.Services;
using FbiApi.Data;


var builder = WebApplication.CreateBuilder(args);
StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

QuestPDF.Settings.License = LicenseType.Community;

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxRequestBodySize = 500 * 1024 * 1024; 
});

builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(x =>
{
    x.ValueLengthLimit = int.MaxValue;
    x.MultipartBodyLengthLimit = int.MaxValue; // 500 MB
});

var keycloakConfig = builder.Configuration.GetSection("Keycloak");
var rabbitMqConfig = builder.Configuration.GetSection("RabbitMq");

builder.Services.AddMassTransit(x =>
{
    // 👇 1. AICI E LIPSA: Trebuie să înregistrezi consumatorul în container
    x.AddConsumer<AnalysisFinishedConsumer>();

    // Aici îi spunem să folosească RabbitMQ
    x.UsingRabbitMq((context, cfg) =>
    {
        // Setările de conectare
        cfg.Host(rabbitMqConfig["Host"] ?? "localhost", "/", h =>
        {
            h.Username(rabbitMqConfig["Username"]);
            h.Password(rabbitMqConfig["Password"]);
        });

        // Endpoint pentru primire (ascultare)
        cfg.ReceiveEndpoint(rabbitMqConfig["ReceiveQueue"], e =>
        {
            // Important: Spunem că mesajul vine ca JSON simplu
            e.UseRawJsonSerializer(); 
            
            // 👇 2. Aici doar legăm consumatorul (deja înregistrat sus) de coadă
            e.ConfigureConsumer<AnalysisFinishedConsumer>(context);
        });
    });
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // <--- SCHIMBARE: Citim din config, nu hardcodat
        options.Authority = keycloakConfig["Authority"] ?? "http://localhost:8080/realms/myrealm"; 
        options.Audience = keycloakConfig["ClientId"] ?? "myclient";

        Console.WriteLine(options.Authority);
        Console.WriteLine(options.Audience);
        options.RequireHttpsMetadata = false;
        
        // 3. Dacă .NET nu reușește să ia metadatele automat, le forțăm (opțional, dar util)
        // options.MetadataAddress = $"{keycloak["Authority"]}/.well-known/openid-configuration";
        options.TokenValidationParameters = new TokenValidationParameters
        {
           // Ignorăm cine e destinatarul (aud) - Keycloak pune 'account' uneori
            ValidateAudience = false, 
            
            // Ignorăm cine a emis tokenul (iss) - Docker vs Localhost issues
            ValidateIssuer = false,   
            
            // Verificăm doar: Semnătura (Cheia) și Timpul (să nu fie expirat)
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            
            // Toleranță la ceas (dacă Docker are ora puțin diferită de Windows)
            ClockSkew = TimeSpan.Zero
        };
        
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/surveillance"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                // 1. Căutăm claim-ul "realm_access" (care e un JSON string)
                var realmAccess = context.Principal?.FindFirst("realm_access");
                
                if (realmAccess != null)
                {
                    // 2. Parsăm JSON-ul
                    var element = JsonDocument.Parse(realmAccess.Value).RootElement;
                    Console.WriteLine(element);
                    // 3. Căutăm proprietatea "roles"
                    if (element.TryGetProperty("roles", out var roles))
                    {
                        Console.WriteLine(roles);
                        var claimsIdentity = (ClaimsIdentity)context.Principal!.Identity!;
                        
                        // 4. Luăm fiecare rol din array și îl adăugăm ca un claim de tip .NET Role
                        foreach (var role in roles.EnumerateArray())
                        {
                            var roleName = role.GetString();
                            // Adaugă claim-ul standard pe care îl caută [Authorize]
                            claimsIdentity.AddClaim(new Claim(ClaimTypes.Role, roleName!));
                        }
                    }
                }
                return Task.CompletedTask;
            }
        };
    });


// ... builder.Services.AddFluentValidationAutoValidation(); ...

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyMethod()
              .AllowAnyHeader()
              // Truc pentru Dev: Lăsăm orice origine, dar acceptăm și Credentials
              .SetIsOriginAllowed(origin => true) 
              .AllowCredentials(); // <--- OBLIGATORIU pentru SignalR
    });
});

builder.Services.AddMemoryCache();
builder.Services.AddSignalR();
builder.Services.AddAuthorization();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IWantedPersonsService, WantedPersonsService>();

// 1. Configurare Client Supabase
var url = builder.Configuration["Supabase:Url"] ?? "localhost";
var key = builder.Configuration["Supabase:Key"] ?? "1234";

var options = new SupabaseOptions
{
    AutoRefreshToken = true,
    AutoConnectRealtime = false
};

// Singleton pentru că vrem o singură conexiune deschisă
var supabaseClient = new Client(url, key, options);
await supabaseClient.InitializeAsync(); // <--- Important: Inițializarea!

builder.Services.AddSingleton(supabaseClient);

builder.Services.AddHostedService<FbiScraperService>();

builder.Services.AddScoped<IImageService, ImageService>();
builder.Services.AddScoped<IFaceRecognitionService, FaceRecognitionService>();
builder.Services.AddHttpClient(); // <--- CRITIC

builder.Services.AddFluentValidationAutoValidation(); // Activează validarea automată înainte de Controller
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
builder.Services.AddDbContext<AppDbContext>(options => 
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// ---> BLOCUL DE STANDARDIZARE A ERORILOR DE VALIDARE <---
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    // Suprascriem fabrica ce generează răspunsul de eroare 400
    options.InvalidModelStateResponseFactory = context =>
    {
        // 1. Extragem toate erorile din ModelState
        // Rezultatul va fi o listă de string-uri: ["Numele este obligatoriu", "Prețul e negativ"]
        Console.WriteLine(context.ModelState);
        var errors = context.ModelState
            .Where(e => e.Value.Errors.Count > 0)
            .SelectMany(x => x.Value.Errors)
            .Select(x => x.ErrorMessage)
            .ToList();
        
        // 3. Creăm obiectul tău standard ApiResponse
        // (Presupun că ai o metodă .Error() care acceptă și o listă de detalii/erori)
        // Dacă nu ai câmp de List<string> în ApiResponse, poți face string.Join(", ", errors)
        var response = ApiResponse<object?>.Error(errors);

        // 4. Returnăm 400 Bad Request cu formatul NOSTRU
        return new BadRequestObjectResult(response);
    };
});


// ---> ADAUGĂ ACESTE DOUĂ LINII <---
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddAutoMapper(typeof(Program));

builder.Services.AddSwaggerGen(c =>
{
    // Asta RĂMÂNE (Definiția schemei - butonul mare Authorize de sus)
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer"
    });

    // ADAUGĂ linia asta care activează filtrul creat de noi:
    c.OperationFilter<SecurityRequirementsOperationFilter>(); 
});

var app = builder.Build();

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.All
});

// De obicei Swagger e activat doar în Development (ca să nu expui API-ul public)
// if (app.Environment.IsDevelopment())
// {
    app.UseSwagger();   // Generează fișierul .json (ex: /swagger/v1/swagger.json)
    app.UseSwaggerUI(); // Generează interfața grafică HTML (ex: /swagger/index.html)
// }

app.MapHub<SurveilanceHub>("/hubs/surveillance");// Asta va fi adresa ws://localhost:port/hubs/notifications
// Adaugă linia asta:
app.UseMiddleware<FbiApi.Utils.GlobalExceptionMiddleware>();
app.UseStaticFiles(); // <--- Asta face folderul wwwroot public

using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<AppDbContext>();
        // Comanda magică: Aplică toate migrările care lipsesc (echivalentul 'dotnet ef database update')
        // Dacă baza nu există, o creează. Dacă există, o actualizează.
        context.Database.Migrate(); 
        
        Console.WriteLine("Migrarea bazei de date a reușit!");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"A apărut o eroare la migrare: {ex.Message}");
    }
}


app.UseCors("AllowAll");
// app.UseHttpsRedirection();
app.MapControllers();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => "api c# by silviu");

app.MapGet("/public-data", () => "Endpoint public OK");
app.MapGet("/secure-data", () => "Ai acces la endpoint securizat")
    .RequireAuthorization(new AuthorizeAttribute { Roles = "admin" });

app.Run();
