import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { generateToken } from '../utils/token.js';
import { sendOtp, verifyOtp } from '../services/otpService.js';
import { verifyGoogleToken } from '../services/googleService.js';

const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  authProvider: user.authProvider,
  isEmailVerified: user.isEmailVerified,
  createdAt: user.createdAt,
});

// @route POST /api/auth/register
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    let user = await prisma.user.findUnique({ where: { email } });

    if (user && user.isEmailVerified) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    if (user) {
      // Unverified leftover from an earlier attempt: let the real owner start over
      user = await prisma.user.update({
        where: { email },
        data: { name, password: hashedPassword },
      });
    } else {
      user = await prisma.user.create({ data: { name, email, password: hashedPassword } });
    }

    await sendOtp(user, 'signup');
    res.status(201).json({ message: 'Verification code sent to your email', email });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    next(error);
  }
};

// @route POST /api/auth/verify-otp
export const verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const result = await verifyOtp(email, code, 'signup');
    if (result === 'locked') {
      return res.status(429).json({ message: 'Too many wrong attempts, request a new code' });
    }
    if (result !== 'ok') {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const verified = await prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    });

    res.json({ token: generateToken(verified.id), user: toPublicUser(verified) });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/auth/resend-otp
export const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Same response whether or not the account exists, so emails can't be enumerated
    if (user && !user.isEmailVerified) {
      const wait = await sendOtp(user, 'signup');
      if (wait > 0) {
        return res.status(429).json({ message: `Please wait ${wait}s before requesting another code` });
      }
    }

    res.json({ message: 'If that account needs verification, a new code was sent' });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    const valid = user && user.password ? await bcrypt.compare(password, user.password) : false;
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isEmailVerified) {
      await sendOtp(user, 'signup');
      return res.status(403).json({
        message: 'Email not verified. We sent you a new code.',
        needsVerification: true,
        email: user.email,
      });
    }

    res.json({ token: generateToken(user.id), user: toPublicUser(user) });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/auth/me
export const getMe = (req, res) => {
  res.json({ user: toPublicUser(req.user) });
};

// @route POST /api/auth/google
export const googleLogin = async (req, res, next) => {
  try {
    const profile = await verifyGoogleToken(req.body.credential);
    if (!profile) {
      return res.status(401).json({ message: 'Invalid Google credential' });
    }

    let user =
      (await prisma.user.findUnique({ where: { googleId: profile.googleId } })) ||
      (await prisma.user.findUnique({ where: { email: profile.email } }));

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: profile.name,
          email: profile.email,
          googleId: profile.googleId,
          avatar: profile.avatar,
          authProvider: 'GOOGLE',
          isEmailVerified: true,
        },
      });
    } else {
      const data = {};
      if (!user.googleId) data.googleId = profile.googleId;
      if (!user.avatar && profile.avatar) data.avatar = profile.avatar;
      if (!user.isEmailVerified) {
        // Google has proven this person owns the email. An unverified account with
        // this email was created by someone who never proved that, so we wipe its
        // password. Otherwise they could register first and log in as the real owner.
        data.isEmailVerified = true;
        data.password = null;
      }
      if (Object.keys(data).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data });
      }
    }

    res.json({ token: generateToken(user.id), user: toPublicUser(user) });
  } catch (error) {
    next(error);
  }
};