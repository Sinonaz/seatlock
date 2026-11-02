import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const generateRefreshToken = () => {
  return randomBytes(48).toString('base64url');
};

export const hashToken = (token: string) => {
  return createHash('sha256').update(token).digest('hex');
};

export const newFamilyId = () => {
  return randomUUID();
};
