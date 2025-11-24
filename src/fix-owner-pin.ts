import { hashPin } from './utils/pinUtils';
import pool from './utils/database';
import dotenv from 'dotenv';

dotenv.config();

async function fixOwnerPin() {
  try {
    console.log('🔧 Fixing owner PIN...');
    
    // Hash the PIN "1234"
    const hashedPin = await hashPin('1234');
    console.log('🔐 New hashed PIN:', hashedPin);
    
    // Update the owner user with proper hashed PIN
    const [result] = await pool.execute(
      'UPDATE users SET pin_hash = ? WHERE mobile = ?',
      [hashedPin, '1234567890']
    );
    
    console.log('✅ Owner PIN updated successfully!');
    console.log('📱 Mobile: 1234567890');
    console.log('🔑 PIN: 1234 (now properly hashed)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing owner PIN:', error);
    process.exit(1);
  }
}

fixOwnerPin();