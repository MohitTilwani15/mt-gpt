import { ConfigService } from '@nestjs/config';
import { Body, Controller, Post } from '@nestjs/common';
import { gmail } from '@googleapis/gmail';
import { JWT } from 'google-auth-library';

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
  constructor(private readonly configService: ConfigService,) {}

  @Post('email-assistant')
  async handleEmailAssistant(@Body() body: unknown) {
    try {
      console.log('POST /api/email-assistant body:', stringifyBody(body));
  
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.labels',
      ];
  
      const jwtClient = new JWT({
        email: this.configService.getOrThrow<string>('GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'),
        key: this.configService.getOrThrow<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
        scopes,
        subject: 'mohit@alphalink.xyz',
      });
  
      const gmailInstance = gmail({ version: 'v1', auth: jwtClient });
  
      const res = await gmailInstance.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName: 'projects/legaltech-474021/topics/legaltechtopic',
        },
      });
  
      return { status: 'received', gmailWatchResponse: res.data };
    } catch (error) {
      console.error('Error in /api/email-assistant:', error);
    }
  }
}
