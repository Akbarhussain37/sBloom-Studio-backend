const express = require('express');
const router = express.Router();
const { createServiceClient } = require('../lib/supabase');

// GET /unread/counts - Must be defined before /:jobId
router.get('/unread/counts', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required in query string' });
    }

    const supabase = createServiceClient();
    
    // Fetch all messages where is_read == false and sender_id != userId
    const { data, error } = await supabase
      .from('messages_studio')
      .select('job_id')
      .eq('is_read', false)
      .neq('sender_id', userId);

    if (error) {
      console.error('Error fetching unread counts:', error);
      return res.status(500).json({ error: 'Failed to fetch unread counts' });
    }

    // Group into { "job-uuid": count }
    const counts = {};
    if (data) {
      data.forEach(msg => {
        counts[msg.job_id] = (counts[msg.job_id] || 0) + 1;
      });
    }

    return res.json(counts);
  } catch (error) {
    console.error('Unexpected error in /unread/counts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:jobId
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('messages_studio')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }

    return res.json(data || []);
  } catch (error) {
    console.error('Unexpected error in /:jobId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const { jobId, senderId, content } = req.body;
    
    if (!jobId || !senderId || !content) {
      return res.status(400).json({ error: 'jobId, senderId, and content are required' });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('messages_studio')
      .insert([
        {
          job_id: jobId,
          sender_id: senderId,
          content: content,
          is_read: false
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating message:', error);
      return res.status(500).json({ error: 'Failed to create message' });
    }

    return res.status(201).json(data);
  } catch (error) {
    console.error('Unexpected error in POST /:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /read
router.put('/read', async (req, res) => {
  try {
    const { jobId, currentUserId } = req.body;
    
    if (!jobId || !currentUserId) {
      return res.status(400).json({ error: 'jobId and currentUserId are required' });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('messages_studio')
      .update({ is_read: true })
      .eq('job_id', jobId)
      .eq('is_read', false)
      .neq('sender_id', currentUserId);

    if (error) {
      console.error('Error updating messages as read:', error);
      return res.status(500).json({ error: 'Failed to update messages' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in PUT /read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
