import prisma from '../config/prisma.js';

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