import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Under Vitest, tests set process.env directly (see test/e2e-env.ts);
      // loading .env here would let the developer's local file win over
      // per-test values like an in-memory Mongo URI.
      ignoreEnvFile: !!process.env.VITEST,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
