import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationPing } from './schemas/location-ping.schema';
import { AttendanceRecord } from '../attendance/schemas/attendance-record.schema';

describe('LocationService.recordPing', () => {
  let service: LocationService;
  let pingModel: any;
  let attendanceModel: any;

  beforeEach(async () => {
    pingModel = { create: vi.fn() };
    attendanceModel = { findOne: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: getModelToken(LocationPing.name), useValue: pingModel },
        { provide: getModelToken(AttendanceRecord.name), useValue: attendanceModel },
      ],
    }).compile();
    service = moduleRef.get(LocationService);
  });

  it('rejects a ping when the user has no open attendance record', async () => {
    attendanceModel.findOne.mockResolvedValue(null);
    await expect(
      service.recordPing('u1', { lat: 12.97, lng: 77.59, timestamp: new Date().toISOString() }),
    ).rejects.toThrow(ConflictException);
    expect(pingModel.create).not.toHaveBeenCalled();
  });

  it('records a ping when the user is clocked in', async () => {
    attendanceModel.findOne.mockResolvedValue({ _id: 'r1' });
    pingModel.create.mockResolvedValue({ _id: 'p1' });

    await service.recordPing('u1', { lat: 12.97, lng: 77.59, timestamp: '2026-09-14T10:00:00.000Z' });

    expect(pingModel.create).toHaveBeenCalledWith({
      userId: 'u1',
      location: { type: 'Point', coordinates: [77.59, 12.97] },
      timestamp: new Date('2026-09-14T10:00:00.000Z'),
    });
  });
});

describe('LocationService.findLiveLocations', () => {
  let service: LocationService;
  let pingModel: any;
  let attendanceModel: any;

  beforeEach(async () => {
    pingModel = { aggregate: vi.fn() };
    attendanceModel = { distinct: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: getModelToken(LocationPing.name), useValue: pingModel },
        { provide: getModelToken(AttendanceRecord.name), useValue: attendanceModel },
      ],
    }).compile();
    service = moduleRef.get(LocationService);
  });

  it('returns the latest ping per currently clocked-in user', async () => {
    attendanceModel.distinct.mockResolvedValue(['u1', 'u2']);
    pingModel.aggregate.mockResolvedValue([
      { userId: 'u1', lat: 12.97, lng: 77.59, timestamp: new Date('2026-09-14T10:05:00Z') },
    ]);

    const result = await service.findLiveLocations();

    expect(attendanceModel.distinct).toHaveBeenCalledWith('userId', { status: 'open' });
    expect(pingModel.aggregate).toHaveBeenCalledWith([
      { $match: { userId: { $in: ['u1', 'u2'] } } },
      { $sort: { userId: 1, timestamp: -1 } },
      { $group: { _id: '$userId', doc: { $first: '$$ROOT' } } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          lat: { $arrayElemAt: ['$doc.location.coordinates', 1] },
          lng: { $arrayElemAt: ['$doc.location.coordinates', 0] },
          timestamp: '$doc.timestamp',
        },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u1');
  });

  it('returns an empty array when nobody is clocked in', async () => {
    attendanceModel.distinct.mockResolvedValue([]);
    const result = await service.findLiveLocations();
    expect(result).toEqual([]);
    expect(pingModel.aggregate).not.toHaveBeenCalled();
  });
});
