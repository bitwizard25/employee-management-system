import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationPing, LocationPingSchema } from './schemas/location-ping.schema';
import { AttendanceRecord, AttendanceRecordSchema } from '../attendance/schemas/attendance-record.schema';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationPing.name, schema: LocationPingSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
    ]),
  ],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [MongooseModule, LocationService],
})
export class LocationModule {}
