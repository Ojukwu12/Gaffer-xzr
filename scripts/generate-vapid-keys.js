#!/usr/bin/env node
/**
 * VAPID Key Generator
 * Generates Web Push VAPID keys for push notifications
 * Run this once during setup to generate your VAPID keys
 */

const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

console.log('\n🔐 Generating VAPID Keys for Web Push...\n');

try {
  // Generate VAPID keys
  const vapidKeys = webpush.generateVAPIDKeys();
  
  console.log('✓ VAPID keys generated successfully!\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Add these to your .env file:');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
  console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
  console.log('VAPID_SUBJECT=mailto:admin@polyscope.com');
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
  
  // Optionally save to a file
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.example');
  
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    console.log('📝 Creating .env file with VAPID keys...\n');
    
    let envContent = fs.readFileSync(envExamplePath, 'utf8');
    
    // Replace VAPID placeholder values
    envContent = envContent.replace(
      /VAPID_PUBLIC_KEY=.*/,
      `VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`
    );
    envContent = envContent.replace(
      /VAPID_PRIVATE_KEY=.*/,
      `VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`
    );
    
    fs.writeFileSync(envPath, envContent);
    console.log('✓ .env file created with VAPID keys\n');
    console.log('⚠️  Please update other values in .env (GEMINI_API_KEY, MONGODB_URI, etc.)\n');
  } else if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists. Please manually add the keys above.\n');
  }
  
  console.log('Next steps:');
  console.log('1. Add these VAPID keys to your .env file');
  console.log('2. Update VAPID_SUBJECT with your actual email');
  console.log('3. Never share your VAPID_PRIVATE_KEY publicly');
  console.log('4. Use VAPID_PUBLIC_KEY in your frontend for push subscriptions\n');
  
  // Save to a secure file as backup
  const backupPath = path.join(__dirname, '..', 'vapid-keys.txt');
  const backupContent = `
VAPID Keys Generated: ${new Date().toISOString()}

Public Key:
${vapidKeys.publicKey}

Private Key:
${vapidKeys.privateKey}

Subject:
mailto:admin@polyscope.com

⚠️  IMPORTANT: Keep the private key secure and never commit to version control!
⚠️  Add 'vapid-keys.txt' to .gitignore if not already there.
`;
  
  fs.writeFileSync(backupPath, backupContent);
  console.log(`✓ Keys backed up to: ${backupPath}\n`);
  console.log('⚠️  Delete this backup file after copying keys to .env!\n');
  
} catch (error) {
  console.error('✗ Error generating VAPID keys:', error.message);
  process.exit(1);
}
