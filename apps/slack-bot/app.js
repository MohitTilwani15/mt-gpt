import 'dotenv/config';
import { App, LogLevel } from '@slack/bolt';
import { registerListeners } from './listeners/index.js';

const ensureEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
  clientOptions: {
    slackApiUrl: process.env.SLACK_API_URL || 'https://slack.com/api',
  },
});

registerListeners(app);

const startApp = async () => {
  try {
    await app.start();
    app.logger.info('⚡️ Bolt app is running in socket mode!');
  } catch (error) {
    app.logger.error('Failed to start the app', error);
    process.exitCode = 1;
  }
};

startApp();
