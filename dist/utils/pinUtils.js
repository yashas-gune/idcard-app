"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHashed = exports.verifyPin = exports.hashPin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const hashPin = async (pin) => {
    const saltRounds = 10;
    return await bcryptjs_1.default.hash(pin, saltRounds);
};
exports.hashPin = hashPin;
const verifyPin = async (pin, hashedPin) => {
    return await bcryptjs_1.default.compare(pin, hashedPin);
};
exports.verifyPin = verifyPin;
// Helper to check if a string is already hashed
const isHashed = (pin) => {
    return pin.startsWith('$2a$') || pin.startsWith('$2b$');
};
exports.isHashed = isHashed;
