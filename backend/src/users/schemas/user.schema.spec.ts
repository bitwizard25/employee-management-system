import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User, UserDocument, UserSchema } from './user.schema';

describe('UserSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<UserDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
      ],
    }).compile();
    model = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));
    await model.init(); // wait for indexes to build before tests rely on them
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates a user with default role employee', async () => {
    const user = await model.create({
      googleId: 'g-123',
      email: 'jane@example.com',
      name: 'Jane Doe',
    });
    expect(user.role).toBe('employee');
    expect(user.officeIds).toEqual([]);
  });

  it('enforces a unique index on email', async () => {
    await model.create({ googleId: 'g-1', email: 'dup@example.com', name: 'A' });
    await expect(
      model.create({ googleId: 'g-2', email: 'dup@example.com', name: 'B' }),
    ).rejects.toThrow();
  });
});
