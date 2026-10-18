import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const SENSITIVE_QUERY_KEYS = new Set([
  'code',
  'code_challenge',
  'code_verifier',
  'client_id',
  'password',
  'refresh_token',
  'request_id',
  'state',
  'token',
]);

export function sanitizeLoggedUrl(value: string) {
  try {
    const url = new URL(value, 'https://log.invalid');
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return value.split('?')[0];
  }
}

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip, headers } = req;
    const loggedUrl = sanitizeLoggedUrl(originalUrl);
    const referer = headers.referer ? sanitizeLoggedUrl(headers.referer) : undefined;
    const origin = headers.origin || referer || 'unknown';
    const userAgent = headers['user-agent'] || 'unknown';

    // Log all incoming requests with important details
    this.logger.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 INCOMING REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Method:     ${method} ${loggedUrl}
Origin:     ${origin}
IP:         ${ip}
User-Agent: ${userAgent}
Host:       ${headers.host}
Referer:    ${referer || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    // Log response when it completes
    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');

      if (statusCode >= 400) {
        this.logger.error(`
❌ REQUEST FAILED
Method:   ${method} ${loggedUrl}
Status:   ${statusCode}
Origin:   ${origin}
IP:       ${ip}
        `);
      } else {
        this.logger.log(`
✅ REQUEST COMPLETED
Method:   ${method} ${loggedUrl}
Status:   ${statusCode}
Origin:   ${origin}
Size:     ${contentLength || 0} bytes
        `);
      }
    });

    next();
  }
}
