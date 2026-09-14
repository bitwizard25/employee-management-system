import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from '../users/schemas/user.schema';
import { GoogleVerifierService } from './google-verifier.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserDocument;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly googleVerifier: GoogleVerifierService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async loginWithGoogle(idToken: string): Promise<AuthTokens> {
    const profile = await this.googleVerifier.verify(idToken);
    const allowedDomain = this.config.get<string>('ALLOWED_GOOGLE_DOMAIN');
    const emailDomain = profile.email.split('@')[1];
    if (allowedDomain && emailDomain !== allowedDomain) {
      throw new UnauthorizedException('domain not allowed');
    }

    let user = await this.userModel.findOne({ googleId: profile.googleId });
    if (!user) {
      user = await this.userModel.create({
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
      });
    }

    const accessToken = this.jwtService.sign(
      { sub: user._id.toString(), role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: user._id.toString() },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );

    return { accessToken, refreshToken, user };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    const user = await this.userModel.findOne({ _id: payload.sub });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    const accessToken = this.jwtService.sign(
      { sub: user._id.toString(), role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
    return { accessToken };
  }
}
