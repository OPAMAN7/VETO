'use strict';

const webPush = require('web-push');
const keys = webPush.generateVAPIDKeys();

console.log('Generated VAPID keys for local development.');
console.log('Add these values to .env. Never commit or share the private key.');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:your-email@example.com');
