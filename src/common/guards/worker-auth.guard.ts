import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class WorkerAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.configService.get<string>('WORKER_API_KEY');
    if (!configuredKey) {
      throw new UnauthorizedException('Worker authentication is not configured');
    }

    const supplied = context.switchToHttp().getRequest().headers['x-worker-key'];
    if (typeof supplied !== 'string') {
      throw new UnauthorizedException('Worker key required');
    }

    const expectedBuffer = Buffer.from(configuredKey);
    const suppliedBuffer = Buffer.from(supplied);
    if (
      expectedBuffer.length !== suppliedBuffer.length ||
      !timingSafeEqual(expectedBuffer, suppliedBuffer)
    ) {
      throw new UnauthorizedException('Invalid worker key');
    }

    return true;
  }
}
