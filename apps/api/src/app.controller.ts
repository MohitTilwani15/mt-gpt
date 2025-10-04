import { Body, Controller, Post } from '@nestjs/common';

const stringifyBody = (value: unknown): string => {
  try {
    return JSON.stringify(
      value,
      (_key, val) => (typeof val === 'bigint' ? val.toString() : val),
      2,
    );
  } catch {
    return String(value);
  }
};

@Controller()
export class AppController {
  @Post('email-assistant')
  handleEmailAssistant(@Body() body: unknown) {
    console.log('POST /api/email-assistant body:', stringifyBody(body));
    return { status: 'received' };
  }
}
