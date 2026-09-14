import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceRecord } from './schemas/attendance-record.schema';
import { OfficesService } from '../offices/offices.service';

describe('AttendanceService.clockIn', () => {
  let service: AttendanceService;
  let model: any;
  let officesService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    model = { findOne: vi.fn(), create: vi.fn() };
    officesService = { findOne: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getModelToken(AttendanceRecord.name), useValue: model },
        { provide: OfficesService, useValue: officesService },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  it('rejects clock-in when the user already has an open record', async () => {
    model.findOne.mockResolvedValue({ _id: 'existing-open' });
    await expect(
      service.clockIn('u1', { officeId: 'o1', lat: 12.97, lng: 77.59 }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects clock-in when outside the office geofence', async () => {
    model.findOne.mockResolvedValue(null);
    officesService.findOne.mockResolvedValue({
      _id: 'o1',
      location: { coordinates: [77.5946, 12.9716] },
      radiusMeters: 100,
    });
    // ~11km away, well outside a 100m radius
    await expect(
      service.clockIn('u1', { officeId: 'o1', lat: 13.07, lng: 77.5946 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates an open record when inside the geofence', async () => {
    model.findOne.mockResolvedValue(null);
    officesService.findOne.mockResolvedValue({
      _id: 'o1',
      location: { coordinates: [77.5946, 12.9716] },
      radiusMeters: 200,
    });
    model.create.mockResolvedValue({ _id: 'r1', status: 'open' });

    const result = await service.clockIn('u1', { officeId: 'o1', lat: 12.9716, lng: 77.5946 });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', officeId: 'o1', status: 'open' }),
    );
    expect(result.status).toBe('open');
  });
});

describe('AttendanceService.clockOut', () => {
  let service: AttendanceService;
  let model: any;

  beforeEach(async () => {
    model = { findOne: vi.fn(), findOneAndUpdate: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getModelToken(AttendanceRecord.name), useValue: model },
        { provide: OfficesService, useValue: { findOne: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  it('throws NotFoundException when there is no open record', async () => {
    model.findOneAndUpdate.mockResolvedValue(null);
    await expect(service.clockOut('u1', { lat: 12.97, lng: 77.59 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('closes the open record with clock-out time and location', async () => {
    model.findOneAndUpdate.mockResolvedValue({ _id: 'r1', status: 'closed' });
    const result = await service.clockOut('u1', { lat: 12.97, lng: 77.59 });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1', status: 'open' },
      expect.objectContaining({
        status: 'closed',
        clockOut: expect.objectContaining({ location: { lat: 12.97, lng: 77.59 } }),
      }),
      { new: true },
    );
    expect(result.status).toBe('closed');
  });
});
