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
  async handleEmailAssistant(@Body() body: any) {
    try {
      console.log('POST /api/email-assistant body:', stringifyBody(body));

      const { message } = body;
      const encodedMessage = message.data;
      const decodedMessage = JSON.parse(Buffer.from(encodedMessage, 'base64').toString('utf-8'));
      console.log('Decoded message:', stringifyBody(decodedMessage));

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

      const historyRes = await gmailInstance.users.history.list({
        userId: 'mohit@alphalink.xyz',
        startHistoryId: decodedMessage.historyId,
      });
  
      const messages = historyRes.data.history?.flatMap(h => h.messagesAdded ?? []);
      if (!messages?.length) {
        console.log('No new messages found in history.');
        return { status: 'no_new_messages' };
      }

      const messageId = messages[0].message.id;

      const msg = await gmailInstance.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      console.log('Fetched message:', stringifyBody(msg));
  
      return { status: 'received', email: msg };
    } catch (error) {
      console.error('Error in /api/email-assistant:', error);
    }
  }
}
