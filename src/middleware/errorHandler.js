function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource could not be found.'
    }
  });
}

function errorHandler(err, req, res, next) {
  console.error(`[Error] ${err.name || 'Error'}: ${err.message}`);

  let code = err.code || 'INTERNAL_ERROR';
  if (err.type === 'entity.too.large') {
    code = 'PAYLOAD_TOO_LARGE';
  }
  const status = err.status || 500;
  
  res.status(status).json({
    error: {
      code,
      message: status === 500 ? 'An unexpected server error occurred.' : err.message
    }
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
