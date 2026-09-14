import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { LocationService } from './location.service';
import { PingDto } from './dto/ping.dto';

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('ping')
  @Throttle({ default: { limit: 1, ttl: 30000 } })
  ping(@CurrentUser() user: JwtPayload, @Body() dto: PingDto) {
    return this.locationService.recordPing(user.sub, dto);
  }
}
