import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { OfficesService } from './offices.service';
import { Office } from './schemas/office.schema';

describe('OfficesService', () => {
  let service: OfficesService;
  let model: any;

  beforeEach(async () => {
    model = {
      create: vi.fn(),
      find: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      }),
      countDocuments: vi.fn().mockResolvedValue(0),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [OfficesService, { provide: getModelToken(Office.name), useValue: model }],
    }).compile();
    service = moduleRef.get(OfficesService);
  });

  it('creates an office from lat/lng/radius input', async () => {
    model.create.mockResolvedValue({ name: 'HQ' });
    await service.create({ name: 'HQ', address: 'x', lat: 12.9, lng: 77.5, radiusMeters: 100 });
    expect(model.create).toHaveBeenCalledWith({
      name: 'HQ',
      address: 'x',
      location: { type: 'Point', coordinates: [77.5, 12.9] },
      radiusMeters: 100,
    });
  });

  it('throws NotFoundException when deleting a missing office', async () => {
    model.findByIdAndDelete.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
  });
});
