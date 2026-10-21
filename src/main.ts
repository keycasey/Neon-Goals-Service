import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { isAllowedOrigin } from './cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ADD THIS LINE - Global API prefix for production reverse proxy
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  await app.listen(port);
  console.log(`🚀 Neon Goals API running on http://localhost:${port}`);
}
bootstrap();
