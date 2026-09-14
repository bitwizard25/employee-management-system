import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtPayload } from '../auth/jwt.strategy';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  clockIn(@CurrentUser() user: JwtPayload, @Body() dto: ClockInDto) {
    return this.attendanceService.clockIn(user.sub, dto);
  }

  @Post('clock-out')
  clockOut(@CurrentUser() user: JwtPayload, @Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(user.sub, dto);
  }

  @Get('me')
  findMine(@CurrentUser() user: JwtPayload, @Query() pagination: PaginationDto) {
    return this.attendanceService.findMine(user.sub, pagination.page, pagination.limit);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  findAll(
    @Query() pagination: PaginationDto,
    @Query('userId') userId?: string,
    @Query('officeId') officeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.findAllAdmin(
      { userId, officeId, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined },
      pagination.page,
      pagination.limit,
    );
  }

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles('admin')
  summary(@Query('from') from: string, @Query('to') to: string) {
    return this.attendanceService.summary(new Date(from), new Date(to));
  }
}
