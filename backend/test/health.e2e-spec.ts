import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setStaticTestEnv } from './e2e-env';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    setStaticTestEnv();
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();

    // Dynamic import: AppModule's @Module() decorator (and the
    // ConfigModule.forRoot()/validateEnv call inside it) runs at import
    // time, so it must be imported *after* process.env is set above, not
    // via a static top-level import (which Node resolves before this
    // beforeAll body ever runs).
    const { AppModule } = await import('../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  it('GET /health returns ok status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
