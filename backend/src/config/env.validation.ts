import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsString,
  IsUrl,
  Min,
  MinLength,
  validateSync,
  ValidateIf,
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
  @IsBoolean() STRIPE_ENABLED: boolean;
  @ValidateIf((env: EnvironmentVariables) => env.STRIPE_ENABLED)
  @IsString()
  @MinLength(1)
  STRIPE_SECRET_KEY: string;
  @ValidateIf((env: EnvironmentVariables) => env.STRIPE_ENABLED)
  @IsString()
  @MinLength(1)
  STRIPE_WEBHOOK_SECRET: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const enabled = config.STRIPE_ENABLED ?? 'false';
  if (![true, false, 'true', 'false'].includes(enabled as string | boolean)) {
    throw new Error('STRIPE_ENABLED must be true or false');
  }
  const validated = plainToInstance(
    EnvironmentVariables,
    { ...config, STRIPE_ENABLED: enabled === true || enabled === 'true' },
    {
      enableImplicitConversion: true,
    },
  );
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  return validated;
}
