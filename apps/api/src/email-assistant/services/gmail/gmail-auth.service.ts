import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { gmail } from '@googleapis/gmail';
import { JWT } from 'google-auth-library';

export interface GmailAuthContext {
  userEmail: string;
  historyId: string;
  client: ReturnType<typeof gmail>;
}

@Injectable()
export class GmailAuthService {
  constructor(private readonly configService: ConfigService) {}

  createContext(userEmail: string, historyId: string | number): GmailAuthContext {
    const normalizedHistoryId = String(historyId);
    const jwt = new JWT({
      email: this.configService.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'),
      key: this.configService.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      subject: userEmail,
    });

    const gmailClient = gmail({ version: 'v1', auth: jwt });

    return {
      userEmail,
      historyId: normalizedHistoryId,
      client: gmailClient,
    };
  }
}
