import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
};

console.log("🔧 cPanel Database config:", {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  hasPassword: !!dbConfig.password,
});

const pool = mysql.createPool(dbConfig);

pool
  .getConnection()
  .then((connection) => {
    console.log("✅ Connected to cPanel Database successfully");
    connection.release();
  })
  .catch((error) => {
    console.error("❌ cPanel Database connection failed:", error.message);
  });

export default pool;
