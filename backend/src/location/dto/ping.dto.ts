import { IsISO8601, IsNumber, Max, Min } from 'class-validator';

export class PingDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsISO8601()
  timestamp: string;
}
