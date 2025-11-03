import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const keyLength = 32;
const ivLength = 16;

const getEncryptionKey = () => {
  let key = process.env.ENCRYPTION_KEY;
  if (!key) {
    key = crypto.randomBytes(keyLength).toString('hex');
    console.warn('ENCRYPTION_KEY not set! Generated temporary key. Set it in .env for production!');
  }
  return crypto.createHash('sha256').update(key).digest();
};

export const encrypt = (text) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

export const decrypt = (encryptedData) => {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

export const encryptToString = (text) => {
  const encrypted = encrypt(text);
  return JSON.stringify(encrypted);
};

export const decryptFromString = (encryptedString) => {
  const encrypted = JSON.parse(encryptedString);
  return decrypt(encrypted);
};

