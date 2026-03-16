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
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(3001);
  console.log('🚀 Neon Goals API running on http://localhost:3001');
}
bootstrap();
