import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'employee' | 'admin';
export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  googleId: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, type: String, enum: ['employee', 'admin'], default: 'employee' })
  role: UserRole;

  @Prop({ type: [Types.ObjectId], ref: 'Office', default: [] })
  officeIds: Types.ObjectId[];

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
