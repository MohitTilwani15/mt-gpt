FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY apps/DocumentRedlining/DocumentRedlining.csproj apps/DocumentRedlining/
RUN dotnet restore apps/DocumentRedlining/DocumentRedlining.csproj

COPY apps/DocumentRedlining/ apps/DocumentRedlining/

RUN dotnet publish apps/DocumentRedlining/DocumentRedlining.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

ENV DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

ENTRYPOINT ["dotnet", "DocumentRedlining.dll"]
