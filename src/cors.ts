const isPrivateDevHostname = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
  /^192\.168\.\d+\.\d+$/.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname) ||
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d+\.\d+$/.test(hostname);

const isLovablePreviewHostname = (hostname: string): boolean =>
  hostname === 'lovable.app' ||
  hostname.endsWith('.lovable.app') ||
  hostname === 'lovableproject.com' ||
  hostname.endsWith('.lovableproject.com');

const isProductionHostname = (hostname: string): boolean =>
  hostname === 'goals.keycasey.com' || hostname === 'www.goals.keycasey.com';

export const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(origin);

    if (protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    return (
      isPrivateDevHostname(hostname) ||
      isProductionHostname(hostname) ||
      isLovablePreviewHostname(hostname)
    );
  } catch {
    return false;
  }
};
