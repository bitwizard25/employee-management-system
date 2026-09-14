import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AttendanceRecord, AttendanceRecordDocument } from './schemas/attendance-record.schema';
import { OfficesService } from '../offices/offices.service';
import { ClockInDto } from './dto/clock-in.dto';
import { haversineDistanceMeters } from './geo.util';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
    private readonly officesService: OfficesService,
  ) {}

  async clockIn(userId: string, dto: ClockInDto): Promise<AttendanceRecordDocument> {
    const openRecord = await this.attendanceModel.findOne({ userId, status: 'open' });
    if (openRecord) {
      throw new ConflictException('You already have an open attendance record');
    }

    const office = await this.officesService.findOne(dto.officeId);
    const [officeLng, officeLat] = office.location.coordinates;
    const distance = haversineDistanceMeters(
      { lat: dto.lat, lng: dto.lng },
      { lat: officeLat, lng: officeLng },
    );
    if (distance > office.radiusMeters) {
      throw new BadRequestException(
        `You are ${Math.round(distance)}m from the office, outside the ${office.radiusMeters}m radius`,
      );
    }

    return this.attendanceModel.create({
      userId,
      officeId: dto.officeId,
      clockIn: { time: new Date(), location: { lat: dto.lat, lng: dto.lng } },
      status: 'open',
    });
  }
}
