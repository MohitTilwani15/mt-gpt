import { IsString, IsOptional, IsArray, IsEnum, IsUUID, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { UIMessage } from 'ai';

export enum ChatModel {
  GPT_5 = 'gpt-5',
  GPT_5_NANO = 'gpt-5-nano',
  GPT_4O = 'gpt-4o',
  // CLAUDE_3_5_SONNET = 'claude-3-5-sonnet-20241022',
  // GEMINI_1_5_PRO = 'gemini-1.5-pro',
  O4_MINI = 'o4-mini',
  O3_MINI = 'o3-mini',
  // GROK_3_MINI = 'grok-3-mini',
  // GROK_3 = 'grok-3',
}

export const CHAT_MODEL_NAMES: Record<ChatModel, string> = {
  [ChatModel.GPT_5]: 'GPT-5',
  [ChatModel.GPT_5_NANO]: 'GPT-5 Nano',
  [ChatModel.GPT_4O]: 'GPT-4o',
  // [ChatModel.CLAUDE_3_5_SONNET]: 'Claude 3.5 Sonnet',
  // [ChatModel.GEMINI_1_5_PRO]: 'Gemini 1.5 Pro',
  [ChatModel.O4_MINI]: 'O4 Mini (Reasoning)',
  [ChatModel.O3_MINI]: 'O3 Mini (Reasoning)',
  // [ChatModel.GROK_3_MINI]: 'Grok 3 Mini',
  // [ChatModel.GROK_3]: 'Grok 3',
};

export const CHAT_MODEL_SUPPORTS_REASONING: Record<ChatModel, boolean> = {
  [ChatModel.GPT_5]: false,
  [ChatModel.GPT_5_NANO]: false,
  [ChatModel.GPT_4O]: false,
  [ChatModel.O4_MINI]: true,
  [ChatModel.O3_MINI]: true,
};

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

  message: UIMessage;

  @IsOptional()
  @IsEnum(ChatModel)
  selectedChatModel?: ChatModel;

  @IsOptional()
  @IsBoolean()
  enableReasoning?: boolean;

  @IsOptional()
  @IsUUID()
  assistantId?: string;
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

export class ForkChatRequestDto {
  @IsUUID()
  messageId: string;
}

export class GetMessagesQueryDto {
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
