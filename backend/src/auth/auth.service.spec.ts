import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { GoogleVerifierService } from './google-verifier.service';
import { User } from '../users/schemas/user.schema';

describe('AuthService', () => {
  let service: AuthService;
  let userModel: any;
  let googleVerifier: { verify: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    userModel = {
      findOne: vi.fn(),
      create: vi.fn(),
    };
    googleVerifier = { verify: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: GoogleVerifierService, useValue: googleVerifier },
        {
          provide: JwtService,
          useValue: {
            sign: vi.fn().mockReturnValue('signed-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const values: Record<string, string> = {
                ALLOWED_GOOGLE_DOMAIN: 'example.com',
                JWT_ACCESS_SECRET: 'a'.repeat(32),
                JWT_REFRESH_SECRET: 'b'.repeat(32),
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('creates a new employee user on first Google login', async () => {
    googleVerifier.verify.mockResolvedValue({
      email: 'new@example.com',
      name: 'New Person',
      googleId: 'g-999',
    });
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockResolvedValue({
      _id: 'u1',
      email: 'new@example.com',
      role: 'employee',
    });

    const result = await service.loginWithGoogle('fake-id-token');

    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', googleId: 'g-999' }),
    );
    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toBe('signed-token');
    expect(result.user.email).toBe('new@example.com');
  });

  it('rejects a login from outside the allowed Google domain', async () => {
    googleVerifier.verify.mockResolvedValue({
      email: 'outsider@other.com',
      name: 'Outsider',
      googleId: 'g-000',
    });

    await expect(service.loginWithGoogle('fake-id-token')).rejects.toThrow(
      'domain not allowed',
    );
  });
});
