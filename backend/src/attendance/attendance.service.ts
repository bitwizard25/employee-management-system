import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AttendanceRecord, AttendanceRecordDocument } from './schemas/attendance-record.schema';
import { OfficesService } from '../offices/offices.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
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

  async clockOut(userId: string, dto: ClockOutDto): Promise<AttendanceRecordDocument> {
    const updated = await this.attendanceModel.findOneAndUpdate(
      { userId, status: 'open' },
      {
        status: 'closed',
        clockOut: { time: new Date(), location: { lat: dto.lat, lng: dto.lng } },
      },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('No open attendance record to clock out of');
    }
    return updated;
  }

  async findMine(
    userId: string,
    page: number,
    limit: number,
    from?: Date,
    to?: Date,
  ): Promise<{ items: AttendanceRecordDocument[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { userId };
    if (from || to) {
      filter['clockIn.time'] = {
        ...(from && { $gte: from }),
        ...(to && { $lte: to }),
      };
    }
    const [items, total] = await Promise.all([
      this.attendanceModel
        .find(filter)
        .sort({ 'clockIn.time': -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.attendanceModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async findAllAdmin(
    filters: { userId?: string; officeId?: string; from?: Date; to?: Date },
    page: number,
    limit: number,
  ) {
    const filter: Record<string, unknown> = {};
    if (filters.userId) filter.userId = filters.userId;
    if (filters.officeId) filter.officeId = filters.officeId;
    if (filters.from || filters.to) {
      filter['clockIn.time'] = {
        ...(filters.from && { $gte: filters.from }),
        ...(filters.to && { $lte: filters.to }),
      };
    }
    const [items, total] = await Promise.all([
      this.attendanceModel
        .find(filter)
        .sort({ 'clockIn.time': -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.attendanceModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  summary(from: Date, to: Date): Promise<{ userId: string; totalHours: number }[]> {
    return this.attendanceModel.aggregate([
      {
        $match: {
          status: 'closed',
          'clockIn.time': { $gte: from, $lte: to },
        },
      },
      {
        $project: {
          userId: 1,
          hours: {
            $divide: [{ $subtract: ['$clockOut.time', '$clockIn.time'] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalHours: { $sum: '$hours' },
        },
      },
      {
        $project: { _id: 0, userId: '$_id', totalHours: 1 },
      },
    ]);
  }
}
