"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
const pool = promise_1.default.createPool(dbConfig);
pool
    .getConnection()
    .then((connection) => {
    console.log("✅ Connected to cPanel Database successfully");
    connection.release();
})
    .catch((error) => {
    console.error("❌ cPanel Database connection failed:", error.message);
});
exports.default = pool;
