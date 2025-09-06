import * as authSchema from './auth.schema';
import * as conversationSchema from './conversation.schema';
import * as streamSchema from './stream.schema';

export const databaseSchema = {
  ...authSchema,
  ...conversationSchema,
  ...streamSchema,
};
