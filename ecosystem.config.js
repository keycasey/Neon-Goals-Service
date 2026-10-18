module.exports = {
  apps: [{
    name: 'neon-goals-service',
    script: './dist/src/main.js',
    cwd: '/var/www/Neon-Goals-Service',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      MCP_ENABLED: 'true',
      MCP_OAUTH_ENABLED: 'true',
      MCP_PUBLIC_BASE_URL: 'https://goals.keycasey.com/api',
      MCP_PERSONAL_GRANTS_ENABLED: 'false'
    }
  }]
};
