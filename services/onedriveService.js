const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const { CLIENT_ID, CLIENT_SECRET, TENANT_ID, USER_ID, ONEDRIVE_FOLDER } = process.env;

let accessToken = null;
let tokenExpiresAt = 0;

/**
 * Gets a Microsoft Graph Access Token
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');

  try {
    const response = await axios.post(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    accessToken = response.data.access_token;
    // expire token a bit early to be safe
    tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000; 
    
    return accessToken;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw new Error('Failed to get Microsoft Graph Access Token');
  }
}

/**
 * Uploads a file to OneDrive
 * @param {string} filePath Local path to the file
 * @param {string} fileName Name of the file to save in OneDrive
 * @returns {Promise<Object>} Details of the uploaded file (id, webUrl)
 */
async function uploadToOneDrive(filePath, fileName) {
  const token = await getAccessToken();
  const fileStats = fs.statSync(filePath);
  
  // For larger files (>4MB), we should use upload sessions. 
  // For simplicity based on the plan, this uses simple upload (max 4MB). 
  // If files are large, this might need an upload session endpoint.
  // We will assume typical small document uploads for this basic implementation.
  // Upload url: PUT https://graph.microsoft.com/v1.0/users/{USER_ID}/drive/root:/{ONEDRIVE_FOLDER}/{fileName}:/content
  const uploadUrl = `https://graph.microsoft.com/v1.0/users/${USER_ID}/drive/root:/${ONEDRIVE_FOLDER}/${encodeURIComponent(fileName)}:/content`;
  
  try {
    const fileStream = fs.createReadStream(filePath);
    const response = await axios.put(uploadUrl, fileStream, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileStats.size
      }
    });

    return {
      id: response.data.id,
      webUrl: response.data.webUrl,
      downloadUrl: response.data['@microsoft.graph.downloadUrl']
    };
  } catch (error) {
    console.error('Error uploading file to OneDrive:', error.response?.data || error.message);
    throw new Error('Failed to upload file to OneDrive');
  }
}

/**
 * Downloads a file from OneDrive
 * @param {string} fileId 
 * @returns {Promise<stream>}
 */
async function downloadFromOneDrive(fileId) {
  const token = await getAccessToken();
  const downloadUrl = `https://graph.microsoft.com/v1.0/users/${USER_ID}/drive/items/${fileId}/content`;

  try {
    const response = await axios.get(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      responseType: 'stream'
    });
    return response.data;
  } catch (error) {
    console.error('Error downloading from OneDrive:', error.response?.data || error.message);
    throw new Error('Failed to download file from OneDrive');
  }
}

/**
 * Deletes a file from OneDrive
 * @param {string} fileId 
 * @returns {Promise<boolean>}
 */
/**
 * Gets a temporary download URL for a file from OneDrive
 * @param {string} fileId 
 * @returns {Promise<string>}
 */
async function getDownloadUrlFromOneDrive(fileId) {
  const token = await getAccessToken();
  const getUrl = `https://graph.microsoft.com/v1.0/users/${USER_ID}/drive/items/${fileId}`;

  try {
    const response = await axios.get(getUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data['@microsoft.graph.downloadUrl'];
  } catch (error) {
    console.error('Error getting download URL from OneDrive:', error.response?.data || error.message);
    throw new Error('Failed to get download URL from OneDrive');
  }
}

async function deleteFromOneDrive(fileId) {
  const token = await getAccessToken();
  const deleteUrl = `https://graph.microsoft.com/v1.0/users/${USER_ID}/drive/items/${fileId}`;

  try {
    await axios.delete(deleteUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return true;
  } catch (error) {
    if (error.response?.data?.error?.code === 'itemNotFound' || error.response?.status === 404) {
      console.warn('File already deleted or not found in OneDrive.');
      return true;
    }
    console.error('Error deleting from OneDrive:', error.response?.data || error.message);
    throw new Error('Failed to delete file from OneDrive');
  }
}

module.exports = {
  getAccessToken,
  uploadToOneDrive,
  downloadFromOneDrive,
  getDownloadUrlFromOneDrive,
  deleteFromOneDrive
};

