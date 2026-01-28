using FbiApi.Models;
using FbiApi.Utils;

namespace FbiApi.Services;

public interface IFaceRecognitionService {
    public Task<ServiceResult<CheckImageFaceRecognitionResponse>> CheckImageFaceRecognitionMatch(string imageUrl);
}