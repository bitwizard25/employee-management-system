import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OfficeDocument = Office & Document;

class GeoPoint {
  @Prop({ required: true, type: String, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ required: true, type: [Number] })
  coordinates: [number, number]; // [lng, lat]
}

@Schema({ timestamps: true })
export class Office {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true, type: GeoPoint })
  location: GeoPoint;

  @Prop({ required: true, min: 10, max: 2000 })
  radiusMeters: number;
}

export const OfficeSchema = SchemaFactory.createForClass(Office);
OfficeSchema.index({ location: '2dsphere' });
