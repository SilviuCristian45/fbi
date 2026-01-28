# ETAPA 1: Build cu SDK .NET 9.0
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copiem csproj-ul și dăm restore
# VERIFICĂ: Asigură-te că numele "Backend.csproj" e corect!
COPY ["FbiApi.csproj", "./"]
RUN dotnet restore "FbiApi.csproj"

# Copiem tot codul și compilăm
COPY . .
RUN dotnet publish "FbiApi.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ETAPA 2: Runtime cu .NET 9.0 (Imaginea mică)
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Setăm portul intern 7002
ENV ASPNETCORE_URLS=http://+:7002
EXPOSE 7002

# VERIFICĂ: Numele DLL-ului final
ENTRYPOINT ["dotnet", "FbiApi.dll"]