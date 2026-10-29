import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  development = 'development',
  production = 'production',
  test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv) NODE_ENV: NodeEnv;
  @IsInt() PORT: number;
  @IsString() DATABASE_URL: string;
  @IsUrl({ require_tld: false }) FRONTEND_URL: string;
  @IsString() @MinLength(32) JWT_ACCESS_SECRET: string;
  @IsString() JWT_ACCESS_TTL: string;
  @IsInt() @Min(1) REFRESH_TOKEN_TTL_DAYS: number;
  @IsInt() @Min(1) BOOKING_TTL_MINUTES: number;
  @IsInt() @Min(0) REFUND_WINDOW_HOURS: number;
  @IsString() STRIPE_SECRET_KEY: string;
  @IsString() STRIPE_WEBHOOK_SECRET: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  return validated;
}
