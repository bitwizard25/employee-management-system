import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Office, OfficeDocument } from './schemas/office.schema';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { PaginatedResult } from '../users/users.service';

@Injectable()
export class OfficesService {
  constructor(
    @InjectModel(Office.name) private readonly officeModel: Model<OfficeDocument>,
  ) {}

  create(dto: CreateOfficeDto): Promise<OfficeDocument> {
    return this.officeModel.create({
      name: dto.name,
      address: dto.address,
      location: { type: 'Point', coordinates: [dto.lng, dto.lat] },
      radiusMeters: dto.radiusMeters,
    });
  }

  async findOne(id: string): Promise<OfficeDocument> {
    const office = await this.officeModel.findById(id).exec();
    if (!office) throw new NotFoundException(`Office ${id} not found`);
    return office;
  }

  async findPaginated(page: number, limit: number): Promise<PaginatedResult<OfficeDocument>> {
    const [items, total] = await Promise.all([
      this.officeModel.find().skip((page - 1) * limit).limit(limit).exec(),
      this.officeModel.countDocuments(),
    ]);
    return { items, total, page, limit };
  }

  async update(id: string, dto: UpdateOfficeDto): Promise<OfficeDocument> {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.lat !== undefined && dto.lng !== undefined) {
      patch.location = { type: 'Point', coordinates: [dto.lng, dto.lat] };
      delete patch.lat;
      delete patch.lng;
    }
    const updated = await this.officeModel.findByIdAndUpdate(id, patch, { new: true }).exec();
    if (!updated) throw new NotFoundException(`Office ${id} not found`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.officeModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException(`Office ${id} not found`);
  }
}
