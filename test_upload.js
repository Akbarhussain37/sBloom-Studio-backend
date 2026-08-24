const { uploadToOneDrive } = require('./services/onedriveService.js');
uploadToOneDrive('test.txt', 'test-upload.txt').then(console.log).catch(err => console.error(err.message));
