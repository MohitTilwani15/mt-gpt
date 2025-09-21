import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { experimental_createMCPClient } from 'ai';
import type { experimental_MCPClient } from 'ai';

type McpServerConfig = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

interface McpClientEntry {
  name: string;
  client: experimental_MCPClient;
  tools: Record<string, any>;
}

@Injectable()
export class McpToolService implements OnModuleDestroy {
  private readonly logger = new Logger(McpToolService.name);
  private initPromise: Promise<void> | null = null;
  private clients: McpClientEntry[] = [];

  constructor(private readonly configService: ConfigService) {}

  async getTools(): Promise<Record<string, any>> {
    await this.ensureInitialized();

    if (this.clients.length === 0) {
      return {};
    }

    const multipleClients = this.clients.length > 1;
    const aggregated: Record<string, any> = {};

    for (const { name, tools } of this.clients) {
      const prefix = multipleClients ? `${name}:` : '';
      for (const [toolName, tool] of Object.entries(tools)) {
        const keyedName = `${prefix}${toolName}`;
        aggregated[keyedName] = tool;
      }
    }

    return aggregated;
  }

  async onModuleDestroy() {
    for (const entry of this.clients) {
      try {
        await entry.client.close();
      } catch (error) {
        this.logger.warn(`Failed to close MCP client "${entry.name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async ensureInitialized() {
    if (!this.initPromise) {
      this.initPromise = this.initializeClients();
    }

    await this.initPromise;
  }

  private async initializeClients() {
    const serverConfigs = this.getServerConfigs();
    if (serverConfigs.length === 0) {
      this.logger.debug('No MCP servers configured. Skipping MCP tool initialization.');
      return;
    }

    for (const server of serverConfigs) {
      try {
        const client = await experimental_createMCPClient({
          transport: {
            type: 'sse',
            url: server.url,
            headers: server.headers,
          },
        });

        const tools = await client.tools();
        this.clients.push({ name: server.name, client, tools });
        this.logger.log(`Connected to MCP server "${server.name}" at ${server.url}`);
      } catch (error) {
        this.logger.error(
          `Failed to initialize MCP server "${server.name}" (${server.url}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private getServerConfigs(): McpServerConfig[] {
    const configs: McpServerConfig[] = [];

    const serversJson = this.configService.get<string>('MCP_SSE_SERVERS');
    if (serversJson) {
      try {
        const parsed = JSON.parse(serversJson) as Array<McpServerConfig | null>;
        for (const item of parsed) {
          if (item && item.url) {
            configs.push({
              name: item.name?.trim() || this.createDefaultName(configs.length),
              url: item.url,
              headers: item.headers,
            });
          }
        }
      } catch (error) {
        this.logger.error('Failed to parse MCP_SSE_SERVERS. Expected valid JSON array.');
      }
    }

    if (configs.length === 0) {
      const defaultUrl = this.configService.get<string>('MCP_SERVER_URL');
      if (defaultUrl) {
        configs.push({ name: 'mcp', url: defaultUrl });
      }
    }

    return configs;
  }

  private createDefaultName(index: number) {
    return `mcp-${index + 1}`;
  }
}
