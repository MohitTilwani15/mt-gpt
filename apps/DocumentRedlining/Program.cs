using DocumentRedlining;
using DocumentRedlining.Data;
using DocumentRedlining.Options;
using DocumentRedlining.Services;

if (File.Exists(Path.Combine(AppContext.BaseDirectory, ".env")))
{
    DotNetEnv.Env.Load(Path.Combine(AppContext.BaseDirectory, ".env"));
}
else if (File.Exists(Path.Combine(Directory.GetCurrentDirectory(), ".env")))
{
    DotNetEnv.Env.Load(Path.Combine(Directory.GetCurrentDirectory(), ".env"));
}

var builder = Host.CreateApplicationBuilder(args);
builder.Services.Configure<ServiceBusOptions>(builder.Configuration.GetSection(ServiceBusOptions.SectionName));
builder.Services.Configure<DatabaseOptions>(builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.AddSingleton<IRedlineService, RedlineService>();
builder.Services.AddSingleton<IRedlineResultRepository, RedlineResultRepository>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
