import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class PlaidTokenCipherService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const configuredKey = config.get<string>('PLAID_TOKEN_ENCRYPTION_KEY');
    const nodeEnv = config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;

    if (!configuredKey && nodeEnv === 'production') {
      throw new Error('PLAID_TOKEN_ENCRYPTION_KEY must be set in production');
    }

    // Hashing accepts either a secret string or generated base64 material while
    // always producing the 32-byte key AES-256-GCM requires.
    const keyMaterial = configuredKey ?? 'neon-goals-development-plaid-key';
    this.key = createHash('sha256').update(keyMaterial).digest();
  }

  encrypt(token: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [version, ivValue, tagValue, encryptedValue] = payload.split(':');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
      throw new Error('Unsupported Plaid token ciphertext');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
