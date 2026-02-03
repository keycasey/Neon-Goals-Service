import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip, headers } = req;
    const origin = headers.origin || headers.referer || 'unknown';
    const userAgent = headers['user-agent'] || 'unknown';

    // Log all incoming requests with important details
    this.logger.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 INCOMING REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Method:     ${method} ${originalUrl}
Origin:     ${origin}
IP:         ${ip}
User-Agent: ${userAgent}
Host:       ${headers.host}
Referer:    ${headers.referer || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    // Log response when it completes
    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');

      if (statusCode >= 400) {
        this.logger.error(`
❌ REQUEST FAILED
Method:   ${method} ${originalUrl}
Status:   ${statusCode}
Origin:   ${origin}
IP:       ${ip}
        `);
      } else {
        this.logger.log(`
✅ REQUEST COMPLETED
Method:   ${method} ${originalUrl}
Status:   ${statusCode}
Origin:   ${origin}
Size:     ${contentLength || 0} bytes
        `);
      }
    });

    next();
  }
}
