const productionSecrets = [
  'DATABASE_URL',
  'JWT_SECRET',
  'WORKER_API_KEY',
  'PLAID_TOKEN_ENCRYPTION_KEY',
] as const;

export function validateEnvironment(config: Record<string, unknown>) {
  if (config.NODE_ENV !== 'production') {
    return config;
  }

  const missing = productionSecrets.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim().length < 24;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing or weak production configuration: ${missing.join(', ')}`,
    );
  }

  if (config.MCP_OAUTH_ENABLED === 'true') {
    const publicBaseUrl = config.MCP_PUBLIC_BASE_URL;
    if (typeof publicBaseUrl !== 'string' || !publicBaseUrl.startsWith('https://')) {
      throw new Error('MCP_PUBLIC_BASE_URL must be an HTTPS URL when MCP OAuth is enabled');
    }
  }

  return config;
}
