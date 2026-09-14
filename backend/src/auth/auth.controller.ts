import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async google(@Body() dto: GoogleLoginDto) {
    const { accessToken, refreshToken, user } = await this.authService.loginWithGoogle(
      dto.idToken,
    );
    return {
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    };
  }
}
