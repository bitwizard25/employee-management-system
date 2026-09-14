import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleVerifierService } from './google-verifier.service';
import { JwtStrategy } from './jwt.strategy';

// @Global(): JwtAuthGuard/RolesGuard (used by every feature module's
// controllers) depend on Passport internals that only exist where
// PassportModule.register() ran. Making this module global means every
// other module gets those providers without re-importing PassportModule
// itself — see the "Implementation Notes" entry on this exact DI error.
@Global()
@Module({
  imports: [UsersModule, JwtModule.register({}), PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AuthController],
  providers: [AuthService, GoogleVerifierService, JwtStrategy],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
