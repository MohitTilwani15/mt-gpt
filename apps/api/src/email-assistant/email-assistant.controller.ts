import { Body, Controller, Headers, Post } from '@nestjs/common';

import { EmailAssistantService, PubSubPushBody } from './email-assistant.service';

@Controller()
export class EmailAssistantController {
  constructor(private readonly emailAssistantService: EmailAssistantService) {}

  @Post('email-assistant')
  async handlePubSubPush(
    @Body() body: PubSubPushBody,
    @Headers('authorization') authorization?: string,
  ) {
    return this.emailAssistantService.handlePubSubPush(body, authorization);
  }
}
