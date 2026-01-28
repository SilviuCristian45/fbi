using Microsoft.AspNetCore.SignalR;
using FbiApi.Utils;

namespace FbiApi.Hubs;

public class SurveilanceHub : Hub
{
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