using Microsoft.AspNetCore.SignalR;
using FbiApi.Utils;

namespace FbiApi.Hubs;

public class SurveilanceHub : Hub
{

	private readonly Dictionary<string, HashSet<string>> _connections = new();

    public void Add(string userId, string connectionId)
    {
        lock (_connections)
        {
            if (!_connections.TryGetValue(userId, out HashSet<string>? connections))
            {
                connections = new HashSet<string>();
                _connections.Add(userId, connections);
            }

            connections.Add(connectionId);
        }
    }

    public async Task SendMessage(string user, string message)
    {
        // Trimitem mesajul către TOȚI clienții conectați
        Console.WriteLine($"userul {user} a trimis mesajul {message}");
        await Clients.All.SendAsync("ReceiveActivity", user, message);
    }

    // Putem suprascrie ce se întâmplă când cineva se conectează
    public override async Task OnConnectedAsync()
    {
        var user = Context.User;
		var userId = user.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;
		Console.WriteLine($"User ID: {userId}");
		this.Add(userId ?? "unknown", Context.ConnectionId);
        Console.WriteLine(user.IsInRole("USER"));
        Console.WriteLine(user.IsInRole("ADMIN"));

        if (user != null && user.IsInRole("USER")) // Sau verifica claim-ul specific
        {
            // 3. Îl băgăm în grupul VIP
            await Groups.AddToGroupAsync(Context.ConnectionId, "Users");
            Console.WriteLine($"User conectat: {Context.ConnectionId}");
        }

        if (user != null && user.IsInRole("ADMIN")) {
            await Groups.AddToGroupAsync(Context.ConnectionId, "Admins");
            Console.WriteLine($"Admin conectat: {Context.ConnectionId}");
        }   

        await base.OnConnectedAsync();
    }
}