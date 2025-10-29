import { registerAppMention } from './app_mention.js';
import { registerDirectMessage } from './direct_message.js';

/**
 * @param {import('@slack/bolt').App} app
 */
export const register = (app) => {
  registerDirectMessage(app);
  registerAppMention(app);
};
