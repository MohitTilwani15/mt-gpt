import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LinkupClient } from "linkup-sdk";
import { tool } from 'ai';
import { z } from 'zod';

@Injectable()
export class LinkUpSoWebSearchToolService {
  client: LinkupClient

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.client = new LinkupClient({
      apiKey: configService.getOrThrow<string>('LINKUP_SO_API_KEY'),
    })
  }

  async askLinkup(query: string) {
    return await this.client.search({
      query,
      depth: 'standard',
      outputType: 'sourcedAnswer',
    })
  }

  askLinkupTool() {
    return tool({
      description: 'Search the web for up-to-date information',
      inputSchema: z.object({
        query: z.string().min(1).describe('The search query'),
      }),
      execute: async ({ query }) => {
        const result = await this.askLinkup(query);
        return result.answer;
      }
    })
  }
}
