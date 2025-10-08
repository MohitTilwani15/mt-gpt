import * as authSchema from './auth.schema';
import * as conversationSchema from './conversation.schema';
import * as assistantSchema from './assistant.schema';
import * as memorySchema from './memory.schema';
import * as emailAssistantSchema from './email-assistant.schema';
import * as contractTemplateSchema from './contract-template.schema';

export const databaseSchema = {
  ...authSchema,
  ...conversationSchema,
  ...assistantSchema,
  ...memorySchema,
  ...emailAssistantSchema,
  ...contractTemplateSchema,
};
