import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttendanceRecord, AttendanceRecordSchema } from './schemas/attendance-record.schema';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { OfficesModule } from '../offices/offices.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
    ]),
    OfficesModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [MongooseModule, AttendanceService],
})
export class AttendanceModule {}
