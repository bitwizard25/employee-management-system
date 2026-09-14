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
