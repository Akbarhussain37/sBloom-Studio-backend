const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { uploadToOneDrive, downloadFromOneDrive, deleteFromOneDrive } = require('../services/onedriveService');
const { storeMetadata, getAllDocuments, updateDocumentStatus, getDocumentById, deleteDocumentMetadata } = require('../services/dbService');

const router = express.Router();

// Configure multer for temp storage
const uploadDir = path.join(__dirname, process.env.TEMP_UPLOAD_DIR || '../temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

router.post('/upload-document', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { path: filePath, originalname: fileName } = req.file;
  console.log('Received body:', req.body);
  const userName = req.body.userName || req.body.username || 'Unknown User';
  const userEmail = req.body.userEmail || '';
  const userPhone = req.body.userPhone || '';
  const instructions = req.body.instructions || '';

  try {
    // 1. Upload to OneDrive
    const oneDriveResult = await uploadToOneDrive(filePath, fileName);
    
    // 2. Store metadata in Supabase
    const docId = `doc_${Date.now()}`; // simple ID generation, or use uuid
    const metadata = {
      doc_id: docId,
      file_name: fileName,
      file_id: oneDriveResult.id,
      url: oneDriveResult.webUrl,
      status: 'Uploaded', // Initial status
      user_name: userName,
      user_email: userEmail,
      user_phone: userPhone,
      instructions: instructions
    };

    await storeMetadata(metadata);

    // 3. (Optional) Send job to worker - leaving as a TODO or webhook for now
    // await enqueueWorkerJob({ docId, action: 'index' });
    
    // Clean up local temp file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'File uploaded and metadata stored successfully',
      data: metadata
    });

  } catch (error) {
    // Clean up local file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
});


router.get('/documents', async (req, res) => {
  try {
    const documents = await getAllDocuments();
    res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch documents',
      details: error.message
    });
  }
});


router.get('/documents/:fileId/stream', async (req, res) => {
  try {
    const { getDownloadUrlFromOneDrive } = require('../services/onedriveService');
    const downloadUrl = await getDownloadUrlFromOneDrive(req.params.fileId);
    
    // Redirect to the Microsoft Graph download URL which natively supports byte-range requests for video streaming.
    res.redirect(downloadUrl);
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({ error: 'Failed to stream video', details: error.message });
  }
});

router.patch('/documents/:docId/status', async (req, res) => {
  const { docId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const updatedDocument = await updateDocumentStatus(docId, status);
    if (!updatedDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      success: true,
      message: 'Document status updated successfully',
      data: updatedDocument
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update document status',
      details: error.message
    });
  }
});

router.delete('/documents/:docId', async (req, res) => {
  const { docId } = req.params;

  try {
    // 1. Fetch document to get fileId
    const document = await getDocumentById(docId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // 2. Delete from OneDrive
    if (document.file_id) {
      await deleteFromOneDrive(document.file_id);
    }

    // 3. Delete from Supabase
    await deleteDocumentMetadata(docId);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete document',
      details: error.message
    });
  }
});

module.exports = router;



