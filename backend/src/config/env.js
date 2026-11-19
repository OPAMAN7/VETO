'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({
  path: process.env.VETO_ENV_FILE || path.resolve(__dirname, '../../../.env')
});

function readConfig(environment = process.env) {
  const port = Number(environment.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return {
    port,
    storageDriver: String(environment.STORAGE_DRIVER || environment.VETO_STORE || 'sqlite').toLowerCase(),
    mongoUri: environment.MONGODB_URI || '',
    databasePath: environment.VETO_DB_PATH || undefined,
    jsonPath: environment.VETO_JSON_PATH || undefined,
    geminiApiKey: environment.GEMINI_API_KEY || '',
    geminiModel: environment.GEMINI_MODEL || 'gemini-2.5-flash',
    ebayClientId: environment.EBAY_CLIENT_ID || '',
    ebayClientSecret: environment.EBAY_CLIENT_SECRET || '',
    ebayMarketplaceId: environment.EBAY_MARKETPLACE_ID || 'EBAY_US',
    vapidPublicKey: environment.VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: environment.VAPID_PRIVATE_KEY || '',
    vapidSubject: environment.VAPID_SUBJECT || ''
  };
}

module.exports = { readConfig };
