namespace FbiApi.Models;

public class ServiceResult<T>
{
    public bool Success { get; set; }
    public T Data { get; set; } // De ex: ID-ul comenzii
    public string ErrorMessage { get; set; }

    // Constructor privat ca să forțăm folosirea metodelor statice de mai jos
    private ServiceResult() { }

    // Metoda de succes (Factory Method)
    public static ServiceResult<T> Ok(T data)
    {
        return new ServiceResult<T> 
        { 
            Success = true, 
            Data = data,
            ErrorMessage = null
        };
    }

    public static ServiceResult<T> Fail(string message)
    {
        return new ServiceResult<T> 
        { 
            Success = false, 
            Data = default, 
            ErrorMessage = message 
        };
    }

    public static implicit operator ServiceResult<T>(T data)
    {
        return Ok(data);
    }

    public static implicit operator ServiceResult<T>(ServiceError error)
    {
        return Fail(error.Message);
    }
}

public static class ServiceResult
{
    public static ServiceResult<T> Ok<T>(T data) => ServiceResult<T>.Ok(data);
    
    // Un helper pentru fail când vrei să fii explicit
    public static ServiceResult<T> Fail<T>(string message) => ServiceResult<T>.Fail(message);
}

public record ServiceError(string Message);