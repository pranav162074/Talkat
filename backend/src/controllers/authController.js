import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { generateToken } from '../utils/token.js';

// Never send the password hash (or other internal fields) to the client
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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    res.status(201).json({ token: generateToken(user.id), user: toPublicUser(user) });
  } catch (error) {
    // Two simultaneous signups with the same email: the unique constraint catches it
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    next(error);
  }
};

// @route POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Same message for "no such user", "Google-only account" and "wrong password",
    // so attackers can't use the response to find out which emails are registered
    const valid = user && user.password ? await bcrypt.compare(password, user.password) : false;
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
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