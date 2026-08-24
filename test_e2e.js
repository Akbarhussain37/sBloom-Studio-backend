const { uploadToOneDrive } = require('./services/onedriveService.js');
const { storeMetadata } = require('./services/dbService.js');

async function testE2E() {
  try {
    const docId = 'test-doc-id-' + Date.now();
    const fileName = 'test.txt';
    const result = await uploadToOneDrive('test.txt', fileName);
    console.log('OneDrive Upload Success:', result.webUrl);
    
    await storeMetadata(docId, fileName, result.id, result.webUrl);
    console.log('Supabase Save Success!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}
testE2E();
