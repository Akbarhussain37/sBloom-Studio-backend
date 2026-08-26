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
  const userRole = req.body.userRole || 'creator';

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
      instructions: instructions,
      user_role: userRole
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

router.post('/sync-supabase-status', async (req, res) => {
  const { fileName, status } = req.body;
  const { createClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { data: assets } = await supabaseAdmin.from('media_assets_studio').select('id').eq('file_name', fileName);
    if (assets && assets.length > 0) {
      await supabaseAdmin.from('media_assets_studio').update({ status }).eq('id', assets[0].id);
      await supabaseAdmin.from('production_jobs_studio').update({ status }).eq('media_asset_id', assets[0].id);
      return res.json({ success: true, message: 'Synced' });
    }
    return res.status(404).json({ error: 'Asset not found in Supabase' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});







router.get('/signed-url', async (req, res) => {
  const { path: storagePath } = req.query;
  if (!storagePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const { data, error } = await supabase.storage
      .from('creator-content')
      .createSignedUrl(storagePath, 3600);
      
    if (error) throw error;
    
    res.json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error('Error generating signed URL:', err);
    res.status(500).json({ error: 'Failed to generate signed URL', details: err.message });
  }
});






// Admin: sync an edited video back to user-side (uses service role key to bypass RLS)
router.post('/admin-sync-edited-video', async (req, res) => {
  const { docId, fileId, fileType, fileName, userEmail } = req.body;
  
  if (!docId || !fileId || !fileName) {
    return res.status(400).json({ error: 'docId, fileId, and fileName are required' });
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('[admin-sync] docId:', docId, '| fileName:', fileName, '| userEmail:', userEmail, '| fileId:', fileId);

    let userId = null;

    // Step 1: Try to resolve user_id from email
    if (userEmail) {
      const { data: profiles } = await supabaseAdmin
        .from('profile_studio')
        .select('id')
        .eq('email', userEmail)
        .limit(1);
      
      if (profiles && profiles.length > 0) {
        userId = profiles[0].id;
        console.log('[admin-sync] Resolved userId:', userId);
      }
    }

    // Step 2: Find the most recent matching media_assets_studio record
    // First try: exact file_name match scoped to user (most precise)
    // Second try: exact file_name match across all users
    // Third try: CREATE a new record so the user can see the admin's edit
    let assetId = null;

    const buildQuery = (scopedUserId) => {
      let q = supabaseAdmin
        .from('media_assets_studio')
        .select('id, user_id, file_name')
        .eq('file_name', fileName)
        .order('created_at', { ascending: false })
        .limit(1);
      if (scopedUserId) q = q.eq('user_id', scopedUserId);
      return q;
    };

    // Try scoped search first
    if (userId) {
      const { data: scopedAssets } = await buildQuery(userId);
      if (scopedAssets && scopedAssets.length > 0) {
        assetId = scopedAssets[0].id;
        console.log('[admin-sync] Found scoped asset:', assetId);
      }
    }

    // Fallback: search all users
    if (!assetId) {
      const { data: allAssets } = await buildQuery(null);
      if (allAssets && allAssets.length > 0) {
        assetId = allAssets[0].id;
        userId = allAssets[0].user_id;
        console.log('[admin-sync] Found unscoped asset:', assetId, 'for user:', userId);
      }
    }

    // Final fallback: insert a new media_assets_studio record for this user
    if (!assetId) {
      console.log('[admin-sync] No existing asset found. Creating a new one for user:', userId);
      if (!userId) {
        return res.status(404).json({
          error: 'Cannot create asset: user not found',
          details: `No profile found for email "${userEmail}". Cannot link the edited video to a user.`
        });
      }

      const { data: newAsset, error: insertError } = await supabaseAdmin
        .from('media_assets_studio')
        .insert({
          user_id: userId,
          file_name: fileName,
          file_type: fileType || 'video/mp4',
          file_size: 0,
          storage_path: `onedrive:${fileId}`,
          status: 'READY_FOR_REVIEW',
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[admin-sync] Insert error:', insertError);
        return res.status(500).json({ error: 'Failed to create media asset record', details: insertError.message });
      }

      assetId = newAsset.id;
      console.log('[admin-sync] Created new asset:', assetId);

      // Create a production job for the new asset
      await supabaseAdmin.from('production_jobs_studio').insert({
        media_asset_id: assetId,
        user_id: userId,
        status: 'READY_FOR_REVIEW',
      });

      // Update documents_studio status
      await supabaseAdmin.from('documents_studio').update({ status: 'Review' }).eq('doc_id', docId);

      return res.json({
        success: true,
        message: 'New edited asset created and visible on user dashboard',
        assetId,
        created: true
      });
    }

    // Step 3: Update the existing asset record
    const updatePayload = {
      storage_path: `onedrive:${fileId}`,
      status: 'READY_FOR_REVIEW',
    };
    if (fileType) updatePayload.file_type = fileType;

    const { error: assetUpdateError } = await supabaseAdmin
      .from('media_assets_studio')
      .update(updatePayload)
      .eq('id', assetId);

    if (assetUpdateError) {
      console.error('[admin-sync] Update error:', assetUpdateError);
      return res.status(500).json({ error: 'Failed to update media asset', details: assetUpdateError.message });
    }

    // Update production_jobs_studio
    await supabaseAdmin
      .from('production_jobs_studio')
      .update({ status: 'READY_FOR_REVIEW' })
      .eq('media_asset_id', assetId);

    // Update documents_studio status
    await supabaseAdmin.from('documents_studio').update({ status: 'Review' }).eq('doc_id', docId);

    console.log('[admin-sync] Successfully updated asset:', assetId);
    return res.json({
      success: true,
      message: 'Edited video synced to user side successfully',
      assetId,
      oneDriveFileId: fileId
    });

  } catch (err) {
    console.error('[admin-sync] Unhandled error:', err);
    return res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});
module.exports = router;
