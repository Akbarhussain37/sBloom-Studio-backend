const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * Stores document metadata in the database
 * @param {Object} metadata 
 * @param {string} metadata.doc_id
 * @param {string} metadata.file_name
 * @param {string} metadata.file_id
 * @param {string} metadata.url
 * @param {string} metadata.status
 * @returns {Promise<Object>} The inserted data
 */
async function storeMetadata(metadata) {
  if (!supabase) {
    console.warn("Supabase client not initialized. Skipping metadata storage.");
    return null;
  }

  const { data, error } = await supabase
    .from(process.env.SUPABASE_TABLE_NAME || 'documents_studio')
    .insert([metadata])
    .select();

  if (error) {
    console.error("Error storing metadata:", error);
    throw error;
  }

  return data;
}


/**
 * Fetches all document metadata from the database
 * @returns {Promise<Array>} The list of documents
 */
async function getAllDocuments() {
  if (!supabase) {
    console.warn("Supabase client not initialized.");
    return [];
  }

  const { data, error } = await supabase
    .from(process.env.SUPABASE_TABLE_NAME || 'documents_studio')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching metadata:", error);
    throw error;
  }

  return data;
}

/**
 * Updates the status of a document
 * @param {string} docId 
 * @param {string} status 
 * @returns {Promise<Object>}
 */
async function updateDocumentStatus(docId, status) {
  if (!supabase) {
    console.warn("Supabase client not initialized.");
    return null;
  }

  const { data, error } = await supabase
    .from(process.env.SUPABASE_TABLE_NAME || 'documents_studio')
    .update({ status })
    .eq('doc_id', docId)
    .select()
    .single();

  if (error) {
    console.error("Error updating document status:", error);
    throw error;
  }

  return data;
}

/**
 * Gets a document by ID
 * @param {string} docId 
 * @returns {Promise<Object>}
 */
async function getDocumentById(docId) {
  if (!supabase) {
    console.warn("Supabase client not initialized.");
    return null;
  }

  const { data, error } = await supabase
    .from(process.env.SUPABASE_TABLE_NAME || 'documents_studio')
    .select('*')
    .eq('doc_id', docId)
    .single();

  if (error) {
    console.error("Error fetching document:", error);
    throw error;
  }

  return data;
}

/**
 * Deletes document metadata from the database
 * @param {string} docId 
 * @returns {Promise<boolean>}
 */
async function deleteDocumentMetadata(docId) {
  if (!supabase) {
    console.warn("Supabase client not initialized.");
    return false;
  }

  const { error } = await supabase
    .from(process.env.SUPABASE_TABLE_NAME || 'documents_studio')
    .delete()
    .eq('doc_id', docId);

  if (error) {
    console.error("Error deleting document metadata:", error);
    throw error;
  }

  return true;
}

module.exports = {
  storeMetadata,
  getAllDocuments,
  updateDocumentStatus,
  getDocumentById,
  deleteDocumentMetadata
};
