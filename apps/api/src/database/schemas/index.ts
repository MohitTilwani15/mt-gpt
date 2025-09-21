import * as authSchema from './auth.schema';
import * as conversationSchema from './conversation.schema';
import * as assistantSchema from './assistant.schema';
import * as memorySchema from './memory.schema';

export const databaseSchema = {
  ...authSchema,
  ...conversationSchema,
  ...assistantSchema,
  ...memorySchema,
};
