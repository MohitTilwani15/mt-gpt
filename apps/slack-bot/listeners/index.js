import * as actions from './actions/index.js';
import * as events from './events/index.js';

/**
 * Registers all listener groups with the Bolt app.
 *
 * @param {import('@slack/bolt').App} app
 */
export const registerListeners = (app) => {
  actions.register(app);
  events.register(app);
};
