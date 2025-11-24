import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  try {
    console.log('🔧 Attempting to connect via socket:', process.env.DB_SOCKET);
    
    const connection = await mysql.createConnection({
      socketPath: process.env.DB_SOCKET,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME
    });

    console.log('✅ SUCCESS: MAMP Database connected via socket!');
    
    // Test our actual tables
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📊 Tables in database:', tables);
    
    // Test users table
    const [users] = await connection.execute('SELECT COUNT(*) as count FROM users');
    console.log('👥 Users count:', users);
    
    await connection.end();
    console.log('🎉 Database test completed successfully!');
    
  } catch (error: any) {
    console.error('❌ FAILED: MAMP Database connection error:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    // More detailed debug
    console.log('\n🔧 Debug information:');
    console.log('Socket path:', process.env.DB_SOCKET);
    console.log('User:', process.env.DB_USER);
    console.log('Database:', process.env.DB_NAME);
    console.log('Password provided:', !!process.env.DB_PASS);
  }
}

testConnection();