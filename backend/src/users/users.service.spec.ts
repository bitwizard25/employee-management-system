import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';

describe('UsersService', () => {
  let service: UsersService;
  let model: any;

  beforeEach(async () => {
    model = {
      find: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([{ email: 'a@x.com' }]),
      }),
      countDocuments: vi.fn().mockResolvedValue(1),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: model }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('returns a paginated page of users with total count', async () => {
    const result = await service.findPaginated(1, 20);
    expect(result).toEqual({ items: [{ email: 'a@x.com' }], total: 1, page: 1, limit: 20 });
  });

  it('throws NotFoundException when updating a missing user', async () => {
    model.findByIdAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(service.update('missing-id', { role: 'admin' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
