# ETAPA 1: Build cu SDK .NET 10.0
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# COPIEM NUMELE CORECT AL PROIECTULUI
COPY ["Fbi.MediaService.csproj", "./"]
RUN dotnet restore "Fbi.MediaService.csproj"

COPY . .
# COMPILAM FOLOSIND NUMELE CORECT
RUN dotnet publish "Fbi.MediaService.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ETAPA 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Setam portul 7005
ENV ASPNETCORE_URLS=http://+:7005
EXPOSE 7005

# IMPORTANT: DLL-ul are acum numele proiectului
ENTRYPOINT ["dotnet", "Fbi.MediaService.dll"]