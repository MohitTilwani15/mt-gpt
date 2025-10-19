using System.Text.Json.Serialization;

namespace DocumentRedlining.Models;

public sealed class ContractRedlineMessage
{
    [JsonPropertyName("messageId")]
    public string MessageId { get; set; } = string.Empty;

    [JsonPropertyName("contractType")]
    public string ContractType { get; set; } = string.Empty;

    [JsonPropertyName("operations")]
    public List<ContractRedlineOperation> Operations { get; set; } = [];

    [JsonPropertyName("summary")]
    public List<string> Summary { get; set; } = [];

    [JsonPropertyName("metadata")]
    public ContractRedlineMetadata? Metadata { get; set; }

    [JsonPropertyName("attachments")]
    public List<ContractRedlineAttachment>? Attachments { get; set; }

    [JsonPropertyName("sourceDocument")]
    public ContractRedlineSourceDocument? SourceDocument { get; set; }

    [JsonPropertyName("email")]
    public ContractRedlineEmailContext? Email { get; set; }
}

public sealed class ContractRedlineOperation
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("text")]
    public string? Text { get; set; }

    [JsonPropertyName("anchor")]
    public string? Anchor { get; set; }

    [JsonPropertyName("rationale")]
    public string? Rationale { get; set; }
}

public sealed class ContractRedlineMetadata
{
    [JsonPropertyName("subject")]
    public string? Subject { get; set; }

    [JsonPropertyName("threadId")]
    public string? ThreadId { get; set; }
}

public sealed class ContractRedlineAttachment
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("filename")]
    public string? Filename { get; set; }

    [JsonPropertyName("mimeType")]
    public string? MimeType { get; set; }
}

public sealed class ContractRedlineSourceDocument
{
    [JsonPropertyName("filename")]
    public string? Filename { get; set; }

    [JsonPropertyName("mimeType")]
    public string? MimeType { get; set; }

    [JsonPropertyName("data")]
    public string? Data { get; set; }
}

public sealed class ContractRedlineEmailContext
{
    [JsonPropertyName("userEmail")]
    public string UserEmail { get; set; } = string.Empty;

    [JsonPropertyName("toEmail")]
    public string ToEmail { get; set; } = string.Empty;

    [JsonPropertyName("subject")]
    public string Subject { get; set; } = string.Empty;

    [JsonPropertyName("threadId")]
    public string? ThreadId { get; set; }
}
