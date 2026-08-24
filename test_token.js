const { getAccessToken } = require('./services/onedriveService.js');
getAccessToken().then(console.log).catch(err => console.error(err.message));
