import { NestFactory } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from '@mguay/nestjs-better-auth';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable NestJS's built-in body parser so we can control ordering
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Access Express instance
  const expressApp = app.getHttpAdapter().getInstance();

  // Access BetterAuth instance from AuthService
  const authService = app.get<AuthService>(AuthService);

  // Mount BetterAuth before body parsers
  expressApp.all(
    /^\/api\/auth\/.*/,
    toNodeHandler(authService.instance.handler),
  );

  // Re-enable Nest's JSON body parser AFTER mounting BetterAuth
  expressApp.use(require('express').json());

  app.setGlobalPrefix('api');
  await app.listen(3000);
}
bootstrap();
