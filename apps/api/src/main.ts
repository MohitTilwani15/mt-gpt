import { NestFactory } from '@nestjs/core';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseExporter } from 'langfuse-vercel';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from '@mguay/nestjs-better-auth';
import { AppModule } from './app.module';

async function bootstrap() {
  const lfPublic = process.env.LANGFUSE_PUBLIC_KEY;
  const lfSecret = process.env.LANGFUSE_SECRET_KEY;
  const lfHost = process.env.LANGFUSE_HOST;
  const lfDebug = process.env.LANGFUSE_DEBUG === '1';

  let otel: NodeSDK | undefined;
  if (lfPublic && lfSecret && lfHost) {
    if (lfDebug) diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

    const exporter = new LangfuseExporter({
      publicKey: lfPublic,
      secretKey: lfSecret,
      baseUrl: lfHost,
      debug: lfDebug,
    });

    otel = new NodeSDK({ traceExporter: exporter });
    await otel.start();

    const shutdown = async () => {
      try {
        await otel?.shutdown();
      } catch {}
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

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
