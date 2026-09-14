import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
  AttendanceRecordSchema,
} from './attendance-record.schema';

describe('AttendanceRecordSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<AttendanceRecordDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
        ]),
      ],
    }).compile();
    model = moduleRef.get<Model<AttendanceRecordDocument>>(
      getModelToken(AttendanceRecord.name),
    );
    await model.init();
  }, 60000);

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates an open attendance record on clock-in', async () => {
    const record = await model.create({
      userId: new Types.ObjectId(),
      officeId: new Types.ObjectId(),
      clockIn: { time: new Date(), location: { lat: 12.97, lng: 77.59 } },
      status: 'open',
    });
    expect(record.status).toBe('open');
    expect(record.clockOut).toBeNull();
  });

  it('finds the open record for a user via the compound index query', async () => {
    const userId = new Types.ObjectId();
    await model.create({
      userId,
      officeId: new Types.ObjectId(),
      clockIn: { time: new Date(), location: { lat: 12.97, lng: 77.59 } },
      status: 'open',
    });
    const open = await model.findOne({ userId, status: 'open' });
    expect(open).not.toBeNull();
  });
});
