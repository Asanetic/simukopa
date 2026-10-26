import crypto from 'crypto';

const SECRET_KEY = process.env.AUTH_SECRET || 'appnebula'; // 🔐 Always use env in prod
const TOKEN_EXPIRY_MINUTES = 1140; // 24 hours
//const TOKEN_EXPIRY_MINUTES = 2 * 365 * 24 * 60; // 2 years


// Generate token
export function generateAuthToken(payload = {}) {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_MINUTES * 60;
  const fullPayload = { ...payload, exp };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url');

  const token = `${base64Header}.${base64Payload}.${signature}`;
  return token;
}

//  Validate token
export function validateAuthToken(token) {
  try {
    const [header, payload, signature] = token.split('.');

    const validSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== validSignature) {
      return { valid: false, reason: 'Invalid signature' };
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    if (data.exp && now > data.exp) {
      return { valid: false, reason: 'Token expired' };
    }

    ///console.log(`validated token__`,data);
    return { valid: true, data };
  } catch (err) {
    return { valid: false, reason: 'Malformed token' };
  }
}

export function processAuthToken(request) {
  const authHeader = request.headers.get('authorization');

  ;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, reason: 'Missing or malformed Authorization header', data: null };
  }

  const token = authHeader.split(' ')[1]; // Extract the actual token part

  const { valid, data, reason } = validateAuthToken(token);

  // student-portal tokens are valid only for student routes (processStudentAuthToken)
  if (valid && data?.account_type === 'student') {
    return { valid: false, data: null, reason: 'Student accounts cannot access this resource' };
  }

  return { valid, data, reason };
}

// For student-portal API routes: accepts ONLY student tokens.
export function processStudentAuthToken(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, reason: 'Missing or malformed Authorization header', data: null };
  }
  const { valid, data, reason } = validateAuthToken(authHeader.split(' ')[1]);
  if (valid && data?.account_type !== 'student') return { valid: false, data: null, reason: 'Not a student account' };
  return { valid, data, reason };
}



