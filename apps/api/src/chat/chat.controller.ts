import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Res,
  UseGuards,
  HttpStatus,
  Patch,
  Delete,
  Req,
} from '@nestjs/common';
import { AuthGuard, Session, UserSession } from '@mguay/nestjs-better-auth';
import { Response, Request } from 'express';
import { Readable } from 'stream';
import { JsonToSseTransformStream } from 'ai';

import { ChatService } from './chat.service';
import {
  PostChatRequestDto,
  GetChatsQueryDto,
  GetMessagesQueryDto,
  VoteMessageDto,
  GetVotesQueryDto,
  ChatModel,
  CHAT_MODEL_NAMES,
} from './dto/chat.dto';
import { ChatSDKError } from 'src/lib/errors';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async createChat(
    @Body() body: PostChatRequestDto,
    @Session() session: UserSession,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    try {
      const ac = new AbortController();
      const abort = () => { if (!ac.signal.aborted) ac.abort(); };
      req.on('aborted', abort);
      req.on('close', abort);
      res.on('close', abort);

      const result = await this.chatService.createChat(body, session, ac.signal);
      const webSseStream = result.pipeThrough(new JsonToSseTransformStream());
      const nodeReadable = Readable.fromWeb(webSseStream);

      nodeReadable.on('error', (err) => {
        try {
          res.write(
            `event: error\ndata: ${JSON.stringify({ message: 'stream_error' })}\n\n`,
          );
        } finally {
          res.end();
        }
      });

      nodeReadable.on('end', () => {
        res.end();
      });

      nodeReadable.pipe(res);
      return;
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }

      console.error('Unhandled error in chat API:', error);
      return res.status(500).json({
        error: 'offline:chat',
        message: 'Internal server error',
      });
    }
  }

  @Get()
  async getChats(
    @Query() query: GetChatsQueryDto,
    @Session() session: UserSession,
    @Res() res: Response,
  ) {
    try {
      const limit = Number.parseInt(query.limit || '10');
      const startingAfter = query.startingAfter;
      const endingBefore = query.endingBefore;

      if (startingAfter && endingBefore) {
        throw new ChatSDKError(
          'bad_request:api',
          'Only one of starting_after or ending_before can be provided.',
        );
      }

      const chats = await this.chatService.getChats(session.user.id, {
        limit,
        startingAfter,
        endingBefore,
      });

      return res.json(chats);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'offline:chat',
        message: 'Internal server error',
      });
    }
  }

  @Get('models')
  async getSupportedModels(@Res() res: Response) {
    try {
      const models = Object.values(ChatModel).map((modelId) => ({
        id: modelId,
        name: CHAT_MODEL_NAMES[modelId],
      }));

      return res.json({
        models,
        defaultModel: ChatModel.GPT_4O,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'offline:chat',
        message: 'Failed to fetch supported models',
      });
    }
  }

  @Get('votes')
  async getVotes(
    @Query() query: GetVotesQueryDto,
    @Session() session: UserSession,
    @Res() res: Response,
  ) {
    try {
      const votes = await this.chatService.getVotes(query.chatId, session);
      return res.json(votes);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'offline:chat',
        message: 'Failed to fetch votes',
      });
    }
  }

  @Get(':id')
  async getChatById(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Res() res: Response,
  ) {
    try {
      const result = await this.chatService.getChatById(id, session);
      return res.json(result);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }

      return res.status(500).json({
        error: 'offline:chat',
        message: 'Internal server error',
      });
    }
  }

  @Delete(':id')
  async deleteChat(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Res() res: Response,
  ) {
    try {
      const result = await this.chatService.deleteChatById(id, session);
      return res.json(result);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }
      return res.status(500).json({ error: 'offline:chat', message: 'Internal server error' });
    }
  }

  @Post('create')
  async createNewChat(
    @Body() body: { id: string },
    @Session() session: UserSession,
    @Res() res: Response,
  ) {
    try {
      const chat = await this.chatService.createNewChat(body.id, session);
      return res.json(chat);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'offline:chat',
        message: 'Internal server error',
      });
    }
  }

  @Get(':id/messages')
  async getMessagesByChatId(
    @Param('id') chatId: string,
    @Query() query: GetMessagesQueryDto,
    @Session() session: UserSession,
    @Res() res: Response,
  ) {
    try {
      const messages = await this.chatService.getMessagesByChatId(
        chatId,
        query,
        session,
      );
      return res.json(messages);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'offline:chat',
        message: 'Internal server error',
      });
    }
  }

  @Patch('vote')
  async updateVote(
    @Body() body: VoteMessageDto,
    @Session() session: UserSession,
    @Res() res: Response,
  ) {
    try {
      const result = await this.chatService.updateVote(body, session);
      return res.json(result);
    } catch (error) {
      if (error instanceof ChatSDKError) {
        return res.status(this.getHttpStatus(error.type)).json({
          error: error.type,
          message: error.message,
        });
      }

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'offline:chat',
        message: 'Failed to update vote',
      });
    }
  }

  private getHttpStatus(errorCode: string): number {
    const statusMap: Record<string, number> = {
      'bad_request:api': HttpStatus.BAD_REQUEST,
      'unauthorized:chat': HttpStatus.UNAUTHORIZED,
      'unauthorized:vote': HttpStatus.UNAUTHORIZED,
      'forbidden:chat': HttpStatus.FORBIDDEN,
      'forbidden:vote': HttpStatus.FORBIDDEN,
      'not_found:chat': HttpStatus.NOT_FOUND,
      'not_found:vote': HttpStatus.NOT_FOUND,
      'not_found:stream': HttpStatus.NOT_FOUND,
      'rate_limit:chat': HttpStatus.TOO_MANY_REQUESTS,
      'offline:chat': HttpStatus.INTERNAL_SERVER_ERROR,
    };

    return statusMap[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
