const axios = require('axios');
const { getAccessToken } = require('./services/onedriveService.js');
const fs = require('fs');
require('dotenv').config();

async function findUserId() {
  try {
    const token = await getAccessToken();
    const userEmail = process.env.USER_EMAIL || 'akbar@janmasethu.com';
    const response = await axios.get(`https://graph.microsoft.com/v1.0/users/${userEmail}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const userId = response.data.id;
    console.log('Found User ID for ' + userEmail + ':', userId);

    // Update .env file automatically
    let envContent = fs.readFileSync('.env', 'utf8');
    envContent = envContent.replace(/USER_ID=.*/, `USER_ID=${userId}`);
    fs.writeFileSync('.env', envContent);
    console.log('Successfully updated USER_ID in .env!');

  } catch (err) {
    console.error('Error fetching user:', err.response?.data || err.message);
  }
}

findUserId();
