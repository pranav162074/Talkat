import { OAuth2Client } from 'google-auth-library';
import env from '../config/env.js';

const client = new OAuth2Client(env.googleClientId);

// Verifies the ID token's signature, expiry and audience (our Client ID) with Google.
// Returns the user's details, or null if the token is invalid.
export const verifyGoogleToken = async (idToken) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) return null;

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split('@')[0],
      avatar: payload.picture || null,
    };
  } catch (error) {
    return null;
  }
};