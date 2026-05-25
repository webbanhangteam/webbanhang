const db = require('./config/db');

async function testConnection() {
  try {
    const [rows] = await db.execute('SELECT 1 + 1 AS result');
    console.log('Kết nối MySQL thành công!');
    console.log(rows);
  } catch (error) {
    console.error('Lỗi kết nối MySQL:');
    console.error(error.message);
  }
}

testConnection();