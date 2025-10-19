namespace DocumentRedlining.Options;

public sealed class ServiceBusOptions
{
    public const string SectionName = "ServiceBus";

    public string ConnectionString { get; set; } = string.Empty;
    public string RedliningQueue { get; set; } = string.Empty;
    public string EmailReplyQueue { get; set; } = string.Empty;
}
