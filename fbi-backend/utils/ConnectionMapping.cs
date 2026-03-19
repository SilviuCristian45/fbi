namespace FbiApi.Utils;

public class ConnectionMapping
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

    public IEnumerable<string> GetConnections(string userId)
    {
        if (userId == null) return Enumerable.Empty<string>();

        lock (_connections)
        {
            if (_connections.TryGetValue(userId, out HashSet<string>? connections))
            {
                return connections.ToList();
            }
        }

        return Enumerable.Empty<string>();
    }

    public void Remove(string userId)
    {
        lock (_connections)
        {
            _connections.Remove(userId);
        }
    }
}