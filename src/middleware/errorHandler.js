function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource could not be found.'
    }
  });
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  let code = err.code || 'INTERNAL_ERROR';
  if (err.type === 'entity.too.large') {
    code = 'PAYLOAD_TOO_LARGE';
  }
  if (status === 500) {
    code = 'INTERNAL_ERROR';
    console.error(`[Error] Unexpected server error: ${err.name || 'Error'} (${err.code || 'UNKNOWN'})`);
  } else {
    console.error(`[Error] ${err.name || 'Error'}: ${err.message}`);
  }
  
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
