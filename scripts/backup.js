#!/usr/bin/env node
/**
 * Database Backup Script
 * Creates MongoDB backup with compression
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/polyscope';

/**
 * Creates backup directory if it doesn't exist
 */
const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

/**
 * Performs MongoDB backup
 */
const backup = async () => {
  try {
    ensureBackupDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `polyscope-${timestamp}`);
    
    console.log(`Starting backup to: ${backupPath}`);
    
    // Run mongodump
    const command = `mongodump --uri="${MONGO_URI}" --out="${backupPath}" --gzip`;
    await execAsync(command);
    
    console.log(`✓ Backup completed successfully`);
    console.log(`  Location: ${backupPath}`);
    
    // Clean old backups (keep last 7 days)
    await cleanOldBackups();
    
  } catch (error) {
    console.error('✗ Backup failed:', error.message);
    process.exit(1);
  }
};

/**
 * Removes backups older than 7 days
 */
const cleanOldBackups = async () => {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    let removedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        fs.rmSync(filePath, { recursive: true, force: true });
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`✓ Cleaned ${removedCount} old backup(s)`);
    }
    
  } catch (error) {
    console.warn('Warning: Could not clean old backups:', error.message);
  }
};

// Run backup
backup();
