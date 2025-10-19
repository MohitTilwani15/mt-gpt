using System.Linq;
using DocumentRedlining.Models;
using Microsoft.Extensions.Logging;

namespace DocumentRedlining.Services;

public interface IRedlineService
{
    Task<RedlineResult?> GenerateAsync(ContractRedlineMessage message, CancellationToken cancellationToken);
}

public sealed class RedlineService : IRedlineService
{
    private const string DefaultMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private readonly ILogger<RedlineService> _logger;

    public RedlineService(ILogger<RedlineService> logger)
    {
        _logger = logger;
    }

    public async Task<RedlineResult?> GenerateAsync(ContractRedlineMessage message, CancellationToken cancellationToken)
    {
        if (message.SourceDocument?.Data is null)
        {
            _logger.LogWarning("Redline message {MessageId} missing source document data.", message.MessageId);
            return null;
        }

        byte[] originalBytes;
        try
        {
            originalBytes = Convert.FromBase64String(message.SourceDocument.Data);
        }
        catch (FormatException ex)
        {
            _logger.LogError(ex, "Source document for {MessageId} is not valid base64.", message.MessageId);
            return null;
        }

        var tempFile = Path.Combine(Path.GetTempPath(), $"redline-{Guid.NewGuid():N}.docx");
        try
        {
            await File.WriteAllBytesAsync(tempFile, originalBytes, cancellationToken);

            TrackedChangesEditor.EnableRevisionTracking(tempFile);

            foreach (var operation in message.Operations)
            {
                try
                {
                    ApplyOperation(tempFile, operation);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to apply {OperationType} operation for {MessageId}.", operation.Type, message.MessageId);
                }
            }

            var resultBytes = await File.ReadAllBytesAsync(tempFile, cancellationToken);
            var filename = BuildFilename(message);

            return new RedlineResult
            {
                MessageId = message.MessageId,
                FileName = filename,
                MimeType = message.SourceDocument.MimeType ?? DefaultMimeType,
                DataBase64 = Convert.ToBase64String(resultBytes)
            };
        }
        finally
        {
            try
            {
                if (File.Exists(tempFile))
                {
                    File.Delete(tempFile);
                }
            }
            catch
            {
                // ignore cleanup errors
            }
        }
    }

    private static void ApplyOperation(string filePath, ContractRedlineOperation operation)
    {
        switch (operation.Type)
        {
            case "delete" when !string.IsNullOrWhiteSpace(operation.Text):
                TrackedChangesEditor.DeleteTextWithRedline(filePath, operation.Text);
                break;
            case "insert" when !string.IsNullOrWhiteSpace(operation.Anchor) && !string.IsNullOrWhiteSpace(operation.Text):
                TrackedChangesEditor.InsertTextWithRedline(filePath, operation.Anchor, operation.Text);
                break;
        }
    }

    private static string BuildFilename(ContractRedlineMessage message)
    {
        var subjectPart = message.Email?.Subject ?? message.Metadata?.Subject ?? "Contract";
        var sanitized = new string(subjectPart.Select(ch => char.IsLetterOrDigit(ch) ? ch : '_').ToArray());
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            sanitized = "Contract";
        }

        return $"{sanitized}-Redline.docx";
    }
}

public sealed class RedlineResult
{
    public string MessageId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public string DataBase64 { get; set; } = string.Empty;
}
