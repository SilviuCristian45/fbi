using Microsoft.AspNetCore.SignalR;
using FbiApi.Utils;
using System.Security.Claims; // Nu uita de asta

namespace FbiApi.Hubs;

public class SurveilanceHub : Hub
{
    private readonly ConnectionMapping _connections;

    public SurveilanceHub(ConnectionMapping connections)
    {
        _connections = connections;
    }

    public override async Task OnConnectedAsync()
    {
        var user = Context.User;

        // --- DEBUGGING: Hai să vedem EXACT ce claim-uri ai în token ---
        Console.WriteLine("=== CLAIMS IN TOKEN ===");
        if (user != null)
        {
            foreach (var claim in user.Claims)
            {
                Console.WriteLine($"Type: {claim.Type} | Value: {claim.Value}");
            }
        }
        Console.WriteLine("=======================");

        // --- EXTRAGEREA ID-ULUI (3 Variante de siguranță) ---
        
        // Varianta 1: Standard SignalR (de obicei caută NameIdentifier)
        var userId = Context.UserIdentifier; 

        // Varianta 2: Căutăm explicit formatul .NET
        if (string.IsNullOrEmpty(userId)) 
        {
            userId = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        }

        // Varianta 3: Căutăm "sub" exact așa cum vine din Keycloak (dacă maparea e oprită)
        if (string.IsNullOrEmpty(userId)) 
        {
            userId = user?.FindFirst("sub")?.Value;
        }

        Console.WriteLine($"\n🕵️‍♂️ ID-ul final extras este: {userId}\n");

        // ---------------------------------------------------

        if (!string.IsNullOrEmpty(userId))
        {
            _connections.Add(userId, Context.ConnectionId);

            if (user!.IsInRole("USER")) 
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, "Users");
            }
            if (user.IsInRole("ADMIN")) 
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, "Admins");
            }
        }
        else 
        {
            Console.WriteLine("⚠️ ATENȚIE: Nu am putut extrage UserId-ul din token!");
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier 
                  ?? Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                  ?? Context.User?.FindFirst("sub")?.Value;

        if (!string.IsNullOrEmpty(userId))
        {
            _connections.Remove(userId);
            Console.WriteLine($"User deconectat: {userId}");
        }

        await base.OnDisconnectedAsync(exception);
    }
}