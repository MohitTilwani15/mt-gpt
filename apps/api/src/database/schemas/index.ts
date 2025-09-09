import * as authSchema from './auth.schema';
import * as conversationSchema from './conversation.schema';

export const databaseSchema = {
  ...authSchema,
  ...conversationSchema,
};
