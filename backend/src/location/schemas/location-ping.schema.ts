import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LocationPingDocument = LocationPing & Document;

class GeoPoint {
  @Prop({ required: true, type: String, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ required: true, type: [Number] })
  coordinates: [number, number]; // [lng, lat]
}

@Schema()
export class LocationPing {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: GeoPoint })
  location: GeoPoint;

  @Prop({ required: true })
  timestamp: Date;
}

export const LocationPingSchema = SchemaFactory.createForClass(LocationPing);
LocationPingSchema.index({ userId: 1, timestamp: -1 });
LocationPingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
