const app = require('./src/app');
const config = require('./src/config');

const PORT = config.port;

// Prevent unhandled promise rejections from crashing the server
process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[WARN] Uncaught Exception:', err.message);
});

const server = app.listen(PORT, () => {
  console.log('Backend server running on http://localhost:' + PORT);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('[ERROR] Port ' + PORT + ' is already in use.');
  } else {
    console.error('[ERROR] Server failed to start:', err.message);
  }
  process.exit(1);
});
