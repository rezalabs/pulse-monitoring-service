module.exports = {
  apps: [{
    name: 'pulse-monitoring',
    namespace: 'itf-labs',
    script: './server.js',
    min_uptime: '30s',
    max_memory_restart: '150M',
    max_restarts: 5,
    restart_delay: 5000,
    // Enable logging integration with PM2
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS Z',
    error_file: '/dev/stderr',
    out_file: '/dev/stdout'
  }]
}
