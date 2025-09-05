import { IsString, IsOptional, IsArray, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export enum ChatModel {
  GPT_4O = 'gpt-4o',
  CLAUDE_3_5_SONNET = 'claude-3-5-sonnet-20241022',
  GEMINI_1_5_PRO = 'gemini-1.5-pro',
}

export class ChatMessagePart {
  @IsString()
  type: string;

  @IsString()
  text: string;
}

export class ChatMessage {
  @IsString()
  id: string;

  @IsString()
  role: 'user' | 'assistant';

  @IsArray()
  @Type(() => ChatMessagePart)
  parts: ChatMessagePart[];

  @IsArray()
  attachments: any[];
}

export class PostChatRequestDto {
  @IsUUID()
  id: string;

  @Type(() => ChatMessage)
  message: ChatMessage;

  @IsEnum(ChatModel)
  selectedChatModel: ChatModel;
}

export class GetChatsQueryDto {
  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  startingAfter?: string;

  @IsOptional()
  @IsString()
  endingBefore?: string;
}

export class DeleteChatQueryDto {
  @IsUUID()
  id: string;
}

export class GetVotesQueryDto {
  @IsUUID()
  chatId: string;
}

export class VoteMessageDto {
  @IsUUID()
  chatId: string;

  @IsUUID()
  messageId: string;

  @IsEnum(['up', 'down'])
  type: 'up' | 'down';
}
