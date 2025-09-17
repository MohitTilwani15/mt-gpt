import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createAiGateway } from "ai-gateway-provider";
import type { AiGateway } from "ai-gateway-provider";

@Injectable()
export class CloudflareAIGatewayService {
  public readonly aigateway: AiGateway;

  constructor(
    private readonly configService: ConfigService
  ) {
    const accountId = this.configService.getOrThrow<string>('CLOUDFLARE_ACCOUNT_ID');
    const gateway = this.configService.getOrThrow<string>('CLOUDFLARE_AI_GATEWAY_NAME');
    const apiKey = this.configService.getOrThrow<string>('CLOUDFLARE_AI_GATEWAY_TOKEN');

    this.aigateway = createAiGateway({
      accountId,
      gateway,
      apiKey,
    });
  }
}
