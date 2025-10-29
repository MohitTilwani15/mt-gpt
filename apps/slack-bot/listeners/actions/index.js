import { registerFeedbackAction } from './register_feedback.js';

/**
 * @param {import('@slack/bolt').App} app
 */
export const register = (app) => {
  registerFeedbackAction(app);
};
