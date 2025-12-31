import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'laundromat-secret-key-2024');
const TOKEN_EXPIRY = '30d';

export interface TokenPayload extends JWTPayload {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

// Simplified user type for token creation
export interface TokenUserPayload {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export async function createToken(user: TokenUserPayload): Promise<string> {
  const token = await new SignJWT({
    userId: user._id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return token;
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export function getTokenExpiry(): Date {
  const now = new Date();
  now.setDate(now.getDate() + 30);
  return now;
}
