import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { EmailAssistantService, PubSubPushBody } from './services/email-assistant.service';

@Controller()
export class EmailAssistantController {
  constructor(private readonly emailAssistantService: EmailAssistantService) {}

  @Post('email-assistant')
  @HttpCode(200)
  async handlePubSubPush(
    @Body() body: PubSubPushBody,
    @Headers('authorization') authorization?: string,
  ) {
    console.log('JSON.stringify(body, null, 2): ', JSON.stringify(body, null, 2));
    console.log('authorization: ', authorization);
    return this.emailAssistantService.handlePubSubPush(body, authorization);
  }
}
