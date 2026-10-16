import prisma from '../config/prisma.js';
import { z } from 'zod';

// @route GET /api/users/search?q=
export const searchUsers = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ message: 'Search must be at least 2 characters' });
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        isEmailVerified: true,
        // Names match partially, emails only exactly, so the endpoint
        // can't be used to list or guess other people's email addresses
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: q.toLowerCase() }],
      },
      select: { id: true, name: true, avatar: true },
      orderBy: { name: 'asc' },
      take: 10,
    });

    res.json({ users });
  } catch (error) {
    next(error);
  }
};

const idSchema = z.string().uuid();

// @route GET /api/users/:id
// You can view yourself, or anyone you share a conversation with. Everyone else gets
// the same 404 as a user who doesn't exist, so ids can't be probed. Email is never sent.
export const getUserProfile = async (req, res, next) => {
  try {
    const parsed = idSchema.safeParse(req.params.id);
    if (!parsed.success) return res.status(404).json({ message: 'User not found' });
    const id = parsed.data;

    if (id !== req.user.id) {
      const sharesChat = await prisma.conversationParticipant.findFirst({
        where: {
          userId: id,
          conversation: { participants: { some: { userId: req.user.id } } },
        },
        select: { id: true },
      });
      if (!sharesChat) return res.status(404).json({ message: 'User not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, avatar: true, bio: true, tagline: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user });
  } catch (error) {
    next(error);
  }
};