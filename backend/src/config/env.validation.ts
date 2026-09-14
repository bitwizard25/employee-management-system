import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsInt()
  PORT: number;

  @IsString()
  @MinLength(1)
  MONGO_URI: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @MinLength(1)
  GOOGLE_CLIENT_ID: string;

  @IsString()
  @MinLength(1)
  ALLOWED_GOOGLE_DOMAIN: string;

  @IsString()
  ADMIN_EMAILS: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
