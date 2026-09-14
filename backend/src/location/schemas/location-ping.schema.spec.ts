import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  LocationPing,
  LocationPingDocument,
  LocationPingSchema,
} from './location-ping.schema';

describe('LocationPingSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<LocationPingDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: LocationPing.name, schema: LocationPingSchema },
        ]),
      ],
    }).compile();
    model = moduleRef.get<Model<LocationPingDocument>>(
      getModelToken(LocationPing.name),
    );
    await model.init();
  }, 60000);

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates a location ping', async () => {
    const ping = await model.create({
      userId: new Types.ObjectId(),
      location: { type: 'Point', coordinates: [77.59, 12.97] },
      timestamp: new Date(),
    });
    expect(ping.location.coordinates).toEqual([77.59, 12.97]);
  });

  it('defines a TTL index on timestamp expiring after 60 days', async () => {
    const indexes = await model.collection.indexes();
    const ttlIndex = indexes.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex!.expireAfterSeconds).toBe(60 * 24 * 60 * 60);
  });
});
