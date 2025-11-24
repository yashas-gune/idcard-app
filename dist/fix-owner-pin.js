"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pinUtils_1 = require("./utils/pinUtils");
const database_1 = __importDefault(require("./utils/database"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function fixOwnerPin() {
    try {
        console.log('🔧 Fixing owner PIN...');
        // Hash the PIN "1234"
        const hashedPin = await (0, pinUtils_1.hashPin)('1234');
        console.log('🔐 New hashed PIN:', hashedPin);
        // Update the owner user with proper hashed PIN
        const [result] = await database_1.default.execute('UPDATE users SET pin_hash = ? WHERE mobile = ?', [hashedPin, '1234567890']);
        console.log('✅ Owner PIN updated successfully!');
        console.log('📱 Mobile: 1234567890');
        console.log('🔑 PIN: 1234 (now properly hashed)');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Error fixing owner PIN:', error);
        process.exit(1);
    }
}
fixOwnerPin();
