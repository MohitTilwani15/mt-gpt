using DocumentRedlining.Options;
using DocumentRedlining.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;

namespace DocumentRedlining.Data;

public interface IRedlineResultRepository
{
    Task StoreAsync(RedlineResult result, CancellationToken cancellationToken);
}

public sealed class RedlineResultRepository : IRedlineResultRepository
{
    private readonly DatabaseOptions _options;
    private readonly ILogger<RedlineResultRepository> _logger;

    public RedlineResultRepository(IOptions<DatabaseOptions> options, ILogger<RedlineResultRepository> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task StoreAsync(RedlineResult result, CancellationToken cancellationToken)
    {
        var normalized = NormalizeConnectionString(_options.ConnectionString);

        if (string.IsNullOrWhiteSpace(normalized))
        {
            _logger.LogWarning("Database connection string not configured; skipping persistence for {MessageId}.", result.MessageId);
            return;
        }

        NpgsqlConnection? connection = null;
        try
        {
            connection = new NpgsqlConnection(normalized);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Invalid database connection string; skipping persistence for {MessageId}.", result.MessageId);
            return;
        }

        await using (connection)
        {
            try
            {
                await connection.OpenAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to open database connection; skipping persistence for {MessageId}.", result.MessageId);
                return;
            }

            const string sql = "INSERT INTO email_attachments (message_id, filename, mime_type, data) VALUES (@messageId, @filename, @mimeType, @data)";

            await using var command = new NpgsqlCommand(sql, connection)
            {
                Parameters =
                {
                    new("messageId", result.MessageId),
                    new("filename", result.FileName),
                    new("mimeType", result.MimeType),
                    new("data", result.DataBase64),
                },
            };

            try
            {
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to persist redlined attachment for {MessageId}.", result.MessageId);
            }
        }
    }

    private static string NormalizeConnectionString(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        var trimmed = raw.Trim();
        if (!trimmed.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !trimmed.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        try
        {
            var uri = new Uri(trimmed);

            var userInfo = uri.UserInfo.Split(':', 2);
            var builder = new NpgsqlConnectionStringBuilder
            {
                Host = uri.Host,
                Port = uri.IsDefaultPort ? 5432 : uri.Port,
                Database = uri.AbsolutePath.TrimStart('/'),
                Username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : string.Empty,
            };

            if (userInfo.Length > 1)
            {
                builder.Password = Uri.UnescapeDataString(userInfo[1]);
            }

            if (!string.IsNullOrWhiteSpace(uri.Query))
            {
                var query = uri.Query.TrimStart('?');
                foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
                {
                    var kv = pair.Split('=', 2);
                    if (kv.Length == 0 || string.IsNullOrWhiteSpace(kv[0]))
                    {
                        continue;
                    }

                    var key = Uri.UnescapeDataString(kv[0]);
                    var value = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;
                    builder[key] = value;
                }
            }

            return builder.ToString();
        }
        catch
        {
            return trimmed;
        }
    }
}
