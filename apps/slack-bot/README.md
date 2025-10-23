# Slack Bot Deployment

## Container Image

The Slack bot ships with a dedicated Dockerfile (`apps/slack-bot/Dockerfile`). It builds a lean Node.js 18 image that installs only production dependencies and starts the bot with `node app.js`. The container exposes port `3000` (configurable via the `PORT` environment variable).

Build locally:

```bash
docker build -f apps/slack-bot/Dockerfile -t slack-bot:local .
docker run --rm -it \
  -e SLACK_BOT_TOKEN=your-token \
  -e SLACK_SIGNING_SECRET=your-secret \
  -p 3000:3000 \
  slack-bot:local
```

Configure the rest of the environment variables (`SLACK_APP_TOKEN`, `SLACK_EVENTS_PATH`, `LIGHT_RAG_URL`, `LIGHT_RAG_API_KEY`, etc.) in the container runtime or Azure Container Apps configuration.

## GitHub Actions Deployment

`.github/workflows/azure-slack-bot-deploy.yml` automates builds and deployments to Microsoft Azure Container Apps (ACA).

### Required GitHub Secrets

| Secret | Purpose |
| --- | --- |
| `AZURE_CREDENTIALS` | Azure service principal JSON for `azure/login`. |
| `AZURE_REGISTRY_LOGIN_SERVER` | Registry login server (e.g. `myregistry.azurecr.io`). |
| `AZURE_REGISTRY_USERNAME` | ACR username. |
| `AZURE_REGISTRY_PASSWORD` | ACR password. |
| `AZURE_SLACK_BOT_CONTAINER_APP_NAME` | Target Container App name. |
| `AZURE_RESOURCE_GROUP` | Resource group containing the Container App. |

Optional repository variables (`Settings → Variables → Repository variables`) let you override defaults for:

* `SLACK_BOT_IMAGE_NAME` (image repository/name in ACR)
* `LIGHT_RAG_URL` (default `http://127.0.0.1:9621`)
* `LIGHT_RAG_TIMEOUT_MS` (default `30000`)
* `SLACK_SOCKET_MODE` (default `false`)
* `SLACK_EVENTS_PATH` (default `/slack/action-endpoint`)

> The workflow assumes runtime environment variables (Slack tokens, signing secret, LightRAG URL/API key, etc.) are already configured directly on the Azure Container App. Update those through the Azure Portal or CLI as required.

### Workflow Overview

1. Logs into Azure via OIDC and authenticates with the container registry.
2. Builds and pushes `apps/slack-bot/Dockerfile` to `${ACR_LOGIN_SERVER}/slack-bot:<git-sha>`.
3. Adds the Azure Container Apps CLI extension.
4. Creates or updates the Container App:
   * Secrets are set from GitHub Secrets.
   * Environment variables reference those secrets and configure the bot runtime.
   * Creates the app with external ingress on port `3000` if it does not exist.

Trigger the workflow manually (Run workflow) or push to `main` touching `apps/slack-bot/**` or the workflow file.

Before the first deployment ensure the Container Apps environment and registry exist, and that the chosen ingress URL is reachable from Slack. Configure Slack’s Event Subscriptions to point at `https://<ingress-host>${SLACK_EVENTS_PATH}` after the container is running.
