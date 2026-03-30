#!/usr/bin/env node
/**
 * Admin User Creation Script
 * Creates an admin user with API key for accessing protected endpoints
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../src/models/User');
const { connectDB } = require('../src/config/db');

/**
 * Generates secure API key
 * @returns {string}
 */
const generateApiKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Creates admin user
 */
const createAdminUser = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();
    
    const email = process.env.ADMIN_EMAIL || 'admin@polyscope.com';
    const apiKey = process.env.ADMIN_API_KEY || generateApiKey();
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    
    if (existingAdmin) {
      console.log('✗ Admin user already exists');
      console.log(`  Email: ${existingAdmin.email}`);
      console.log(`  API Key: ${existingAdmin.apiKey}`);
      process.exit(0);
    }
    
    // Create admin user
    const admin = await User.create({
      email,
      apiKey,
      role: 'admin',
      tier: 'premium',
      isActive: true,
      metadata: {
        name: 'System Administrator',
        createdBy: 'setup-script'
      }
    });
    
    console.log('✓ Admin user created successfully!');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  IMPORTANT: Save these credentials securely!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Email:   ${admin.email}`);
    console.log(`  API Key: ${admin.apiKey}`);
    console.log(`  Admin Key Header (x-admin-key): ${process.env.ADMIN_SECRET_KEY || 'SET ADMIN_SECRET_KEY IN .env'}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('Usage example:');
    console.log(`  curl -H "x-admin-key: ${process.env.ADMIN_SECRET_KEY || 'your_admin_secret_key'}" -H "X-API-Key: ${admin.apiKey}" http://localhost:5000/api/admin/debug`);
    console.log('');
    
    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('✗ Error creating admin user:', error.message);
    process.exit(1);
  }
};

// Run
createAdminUser();
