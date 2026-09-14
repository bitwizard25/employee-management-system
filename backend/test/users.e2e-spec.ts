import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setStaticTestEnv } from './e2e-env';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    setStaticTestEnv();
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();

    const { AppModule } = await import('../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  it('rejects GET /users for a non-admin employee token', () => {
    const token = jwtService.sign(
      { sub: '507f1f77bcf86cd799439011', role: 'employee' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
    return request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects GET /users with no token at all', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });
});
