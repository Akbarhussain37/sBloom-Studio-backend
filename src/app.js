const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    
    if (config.cors.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const error = new Error('Origin is not allowed.');
    error.code = 'CORS_ORIGIN_DENIED';
    error.status = 403;
    callback(error);
  }
};
app.use(cors(corsOptions));

const productionRoutes = require('./routes/production');

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api/production', productionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
