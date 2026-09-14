import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationPing, LocationPingDocument } from './schemas/location-ping.schema';
import { AttendanceRecord, AttendanceRecordDocument } from '../attendance/schemas/attendance-record.schema';
import { PingDto } from './dto/ping.dto';

@Injectable()
export class LocationService {
  constructor(
    @InjectModel(LocationPing.name)
    private readonly pingModel: Model<LocationPingDocument>,
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
  ) {}

  async recordPing(userId: string, dto: PingDto): Promise<LocationPingDocument> {
    const openRecord = await this.attendanceModel.findOne({ userId, status: 'open' });
    if (!openRecord) {
      throw new ConflictException('No open attendance record — clock in before sending location pings');
    }
    return this.pingModel.create({
      userId,
      location: { type: 'Point', coordinates: [dto.lng, dto.lat] },
      timestamp: new Date(dto.timestamp),
    });
  }
}
