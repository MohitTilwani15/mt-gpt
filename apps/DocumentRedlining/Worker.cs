using System.Linq;
using System.Text.Json;
using Azure.Messaging.ServiceBus;
using DocumentRedlining.Data;
using DocumentRedlining.Models;
using DocumentRedlining.Options;
using DocumentRedlining.Services;
using Microsoft.Extensions.Options;

namespace DocumentRedlining;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly ServiceBusClient _serviceBusClient;
    private readonly ServiceBusProcessor _processor;
    private readonly ServiceBusSender _emailSender;
    private readonly IRedlineService _redlineService;
    private readonly IRedlineResultRepository _resultRepository;
    private readonly JsonSerializerOptions _serializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    public Worker(
        ILogger<Worker> logger,
        IOptions<ServiceBusOptions> serviceBusOptions,
        IRedlineService redlineService,
        IRedlineResultRepository resultRepository)
    {
        _logger = logger;
        _redlineService = redlineService;
        _resultRepository = resultRepository;

        var options = serviceBusOptions.Value;
        if (string.IsNullOrWhiteSpace(options.ConnectionString))
        {
            throw new InvalidOperationException("Service Bus connection string is missing.");
        }

        if (string.IsNullOrWhiteSpace(options.RedliningQueue))
        {
            throw new InvalidOperationException("Service Bus redlining queue name is missing.");
        }

        if (string.IsNullOrWhiteSpace(options.EmailReplyQueue))
        {
            throw new InvalidOperationException("Service Bus email reply queue name is missing.");
        }

        _serviceBusClient = new ServiceBusClient(options.ConnectionString);
        _processor = _serviceBusClient.CreateProcessor(options.RedliningQueue, new ServiceBusProcessorOptions
        {
            AutoCompleteMessages = false,
            MaxConcurrentCalls = 1,
        });

        _emailSender = _serviceBusClient.CreateSender(options.EmailReplyQueue);

        _processor.ProcessMessageAsync += HandleMessageAsync;
        _processor.ProcessErrorAsync += HandleErrorAsync;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Starting contract redlining worker.");
        await _processor.StartProcessingAsync(stoppingToken);

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (TaskCanceledException)
        {
            // Expected when the host is stopping.
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Stopping contract redlining worker.");
        await _processor.StopProcessingAsync(cancellationToken);
        await base.StopAsync(cancellationToken);
    }

    public override void Dispose()
    {
        _processor.ProcessMessageAsync -= HandleMessageAsync;
        _processor.ProcessErrorAsync -= HandleErrorAsync;

        try
        {
            _emailSender.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to dispose Service Bus email sender cleanly.");
        }

        try
        {
            _processor.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to dispose Service Bus processor cleanly.");
        }

        try
        {
            _serviceBusClient.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to dispose Service Bus client cleanly.");
        }

        base.Dispose();
    }

    private async Task HandleMessageAsync(ProcessMessageEventArgs args)
    {
        ContractRedlineMessage? payload = null;
        try
        {
            payload = JsonSerializer.Deserialize<ContractRedlineMessage>(args.Message.Body.ToString(), _serializerOptions);
            if (payload is null)
            {
                _logger.LogWarning("Received empty redlining payload. Completing message {MessageId}.", args.Message.MessageId);
                await args.CompleteMessageAsync(args.Message);
                return;
            }

            _logger.LogInformation(
                "Processing redlining job for message {MessageId} with {OperationCount} operations.",
                payload.MessageId,
                payload.Operations.Count);

            var result = await _redlineService.GenerateAsync(payload, args.CancellationToken);
            if (result is null)
            {
                _logger.LogWarning("No redline result generated for message {MessageId}; abandoning.", payload.MessageId);
                await args.AbandonMessageAsync(args.Message);
                return;
            }

            await _resultRepository.StoreAsync(result, args.CancellationToken);
            await SendEmailReplyAsync(payload, result, args.CancellationToken);
            await args.CompleteMessageAsync(args.Message);

            _logger.LogInformation("Stored redlined document and enqueued email for message {MessageId}.", payload.MessageId);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialize redline payload for message {MessageId}.", args.Message.MessageId);
            await args.DeadLetterMessageAsync(args.Message, "invalid-json", ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while processing redline message {MessageId}.", payload?.MessageId ?? args.Message.MessageId);
            await args.AbandonMessageAsync(args.Message);
        }
    }

    private Task HandleErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception, "Service Bus error on entity {EntityPath}.", args.EntityPath);
        return Task.CompletedTask;
    }

    private async Task SendEmailReplyAsync(ContractRedlineMessage message, RedlineResult result, CancellationToken cancellationToken)
    {
        if (message.Email is null)
        {
            _logger.LogWarning("No email context provided for redline message {MessageId}; skipping email reply enqueue.", message.MessageId);
            return;
        }

        var emailBody = BuildEmailBody(message.Summary);
        var subject = string.IsNullOrWhiteSpace(message.Email.Subject)
            ? "Contract review feedback"
            : message.Email.Subject;

        var job = new EmailReplyJob
        {
            UserEmail = message.Email.UserEmail,
            MessageId = message.MessageId,
            ThreadId = message.Email.ThreadId,
            ToEmail = message.Email.ToEmail,
            Subject = subject.StartsWith("Review feedback", StringComparison.OrdinalIgnoreCase)
                ? subject
                : $"Review feedback: {subject}",
            Body = emailBody,
            Attachments =
            {
                new EmailReplyAttachment
                {
                    Filename = string.IsNullOrWhiteSpace(result.FileName) ? "Contract-Redline.docx" : result.FileName,
                    MimeType = string.IsNullOrWhiteSpace(result.MimeType)
                        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        : result.MimeType,
                    Data = result.DataBase64,
                },
            },
        };

        var payload = JsonSerializer.Serialize(job, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var busMessage = new ServiceBusMessage(payload)
        {
            ContentType = "application/json",
            Subject = "send-email-reply",
            MessageId = Guid.NewGuid().ToString("N"),
        };

        busMessage.ApplicationProperties["jobName"] = "send-email-reply";
        busMessage.ApplicationProperties["logicalQueue"] = "email-reply";

        await _emailSender.SendMessageAsync(busMessage, cancellationToken);
    }

    private static string BuildEmailBody(IReadOnlyCollection<string> summary)
    {
        if (summary.Count == 0)
        {
            return "No summary available for this review.";
        }

        return string.Join("\n", summary.Select(line => $"• {line}"));
    }
}
