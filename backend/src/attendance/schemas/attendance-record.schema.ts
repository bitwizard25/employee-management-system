import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AttendanceStatus = 'open' | 'closed';
export type AttendanceRecordDocument = AttendanceRecord & Document;

class ClockEvent {
  @Prop({ required: true })
  time: Date;

  @Prop({ type: { lat: Number, lng: Number }, required: true })
  location: { lat: number; lng: number };
}

@Schema({ timestamps: true })
export class AttendanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Office', required: true })
  officeId: Types.ObjectId;

  @Prop({ type: ClockEvent, required: true })
  clockIn: ClockEvent;

  @Prop({ type: ClockEvent, default: null })
  clockOut: ClockEvent | null;

  @Prop({ required: true, type: String, enum: ['open', 'closed'], default: 'open' })
  status: AttendanceStatus;
}

export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);
AttendanceRecordSchema.index({ userId: 1, 'clockIn.time': -1 });
AttendanceRecordSchema.index({ userId: 1, status: 1 });
