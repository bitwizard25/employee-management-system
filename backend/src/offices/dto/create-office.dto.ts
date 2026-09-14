import { IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateOfficeDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsNumber()
  @Min(10)
  @Max(2000)
  radiusMeters: number;
}
