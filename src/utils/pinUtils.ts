import bcrypt from 'bcryptjs';

export const hashPin = async (pin: string): Promise<string> => {
  const saltRounds = 10;
  return await bcrypt.hash(pin, saltRounds);
};

export const verifyPin = async (pin: string, hashedPin: string): Promise<boolean> => {
  return await bcrypt.compare(pin, hashedPin);
};

// Helper to check if a string is already hashed
export const isHashed = (pin: string): boolean => {
  return pin.startsWith('$2a$') || pin.startsWith('$2b$');
};