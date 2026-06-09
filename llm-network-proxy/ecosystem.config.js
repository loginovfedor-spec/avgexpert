module.exports = {
  apps: [
    {
      name: 'llm-network-proxy',
      script: 'start-envoy.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      // Envoy logs to standard output/error, which PM2 captures
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      time: true
    }
  ]
};
