import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Office, OfficeDocument, OfficeSchema } from './office.schema';

describe('OfficeSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<OfficeDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Office.name, schema: OfficeSchema }]),
      ],
    }).compile();
    model = moduleRef.get<Model<OfficeDocument>>(getModelToken(Office.name));
    await model.init();
  }, 60000);

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates an office with a GeoJSON Point location', async () => {
    const office = await model.create({
      name: 'HQ',
      address: '1 Main St',
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      radiusMeters: 150,
    });
    expect(office.location.coordinates).toEqual([77.5946, 12.9716]);
  });

  it('finds offices near a point using the 2dsphere index', async () => {
    const nearOffice = await model.findOne({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [77.595, 12.972] },
          $maxDistance: 5000,
        },
      },
    });
    expect(nearOffice).not.toBeNull();
    expect(nearOffice!.name).toBe('HQ');
  });
});
