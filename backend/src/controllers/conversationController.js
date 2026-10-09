import prisma from '../config/prisma.js';

const userSelect = { id: true, name: true, avatar: true };

const include = {
  participants: {
    orderBy: { joinedAt: 'asc' },
    include: { user: { select: userSelect } },
  },
};

const toDto = (conversation, lastMessage = null) => ({
  id: conversation.id,
  type: conversation.type,
  name: conversation.name,
  avatar: conversation.avatar,
  createdAt: conversation.createdAt,
  participants: conversation.participants.map((p) => ({
    id: p.user.id,
    name: p.user.name,
    avatar: p.user.avatar,
    role: p.role,
  })),
  lastMessage,
});

// @route POST /api/conversations/direct
export const getOrCreateDirect = async (req, res, next) => {
  try {
    const me = req.user.id;
    const { userId } = req.body;

    if (userId === me) {
      return res.status(400).json({ message: "You can't start a chat with yourself" });
    }

    const other = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!other) return res.status(404).json({ message: 'User not found' });

    // Sorted ids make the key identical no matter who starts the chat
    const directKey = [me, userId].sort().join('_');

    let conversation = await prisma.conversation.findUnique({ where: { directKey }, include });
    let created = false;

    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            type: 'DIRECT',
            directKey,
            participants: { create: [{ userId: me }, { userId }] },
          },
          include,
        });
        created = true;
      } catch (error) {
        // Both users opened the chat at the same moment: the unique key stopped the duplicate
        if (error.code !== 'P2002') throw error;
        conversation = await prisma.conversation.findUnique({ where: { directKey }, include });
      }
    }

    res.status(created ? 201 : 200).json({ conversation: toDto(conversation) });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/conversations/group
export const createGroup = async (req, res, next) => {
  try {
    const me = req.user.id;
    const { name } = req.body;
    const memberIds = [...new Set(req.body.memberIds)].filter((id) => id !== me);

    if (memberIds.length === 0) {
      return res.status(400).json({ message: 'Add at least one other member' });
    }

    const found = await prisma.user.count({ where: { id: { in: memberIds } } });
    if (found !== memberIds.length) {
      return res.status(404).json({ message: 'One or more users were not found' });
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        name,
        participants: {
          create: [
            { userId: me, role: 'ADMIN' },
            ...memberIds.map((userId) => ({ userId })),
          ],
        },
      },
      include,
    });

    res.status(201).json({ conversation: toDto(conversation) });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/conversations
export const listConversations = async (req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId: req.user.id } } },
      include: {
        ...include,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const result = conversations
      .map((c) => toDto(c, c.messages[0] || null))
      .sort((a, b) => {
        const aTime = new Date(a.lastMessage?.createdAt || a.createdAt);
        const bTime = new Date(b.lastMessage?.createdAt || b.createdAt);
        return bTime - aTime;
      });

    res.json({ conversations: result });
  } catch (error) {
    next(error);
  }
};

// @route GET /api/conversations/:id
export const getConversation = async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, participants: { some: { userId: req.user.id } } },
      include,
    });

    // Same 404 whether it doesn't exist or you aren't in it, so ids can't be probed
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    res.json({ conversation: toDto(conversation) });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/conversations/:id/participants
export const addParticipants = async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, participants: { some: { userId: req.user.id } } },
      include: { participants: true },
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    if (conversation.type !== 'GROUP') {
      return res.status(400).json({ message: 'Members can only be added to groups' });
    }

    const mine = conversation.participants.find((p) => p.userId === req.user.id);
    if (mine.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only admins can add members' });
    }

    const userIds = [...new Set(req.body.userIds)];
    const found = await prisma.user.count({ where: { id: { in: userIds } } });
    if (found !== userIds.length) {
      return res.status(404).json({ message: 'One or more users were not found' });
    }

    await prisma.conversationParticipant.createMany({
      data: userIds.map((userId) => ({ userId, conversationId: conversation.id })),
      skipDuplicates: true,
    });

    const updated = await prisma.conversation.findUnique({ where: { id: conversation.id }, include });
    res.json({ conversation: toDto(updated) });
  } catch (error) {
    next(error);
  }
};

// @route DELETE /api/conversations/:id/participants/:userId
export const removeParticipant = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const me = req.user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { orderBy: { joinedAt: 'asc' } } },
    });

    const mine = conversation?.participants.find((p) => p.userId === me);
    if (!mine) return res.status(404).json({ message: 'Conversation not found' });

    if (conversation.type !== 'GROUP') {
      return res.status(400).json({ message: 'You can only leave or remove members in groups' });
    }

    const target = conversation.participants.find((p) => p.userId === userId);
    if (!target) return res.status(404).json({ message: 'Member not found' });

    if (userId !== me && mine.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only admins can remove other members' });
    }

    const remaining = conversation.participants.filter((p) => p.userId !== userId);

    // Last person leaving: remove the whole conversation (messages cascade)
    if (remaining.length === 0) {
      await prisma.conversation.delete({ where: { id } });
      return res.status(204).end();
    }

    await prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.delete({ where: { id: target.id } });

      // Never leave a group without an admin: promote the longest-standing member
      const stillHasAdmin = remaining.some((p) => p.role === 'ADMIN');
      if (!stillHasAdmin) {
        await tx.conversationParticipant.update({
          where: { id: remaining[0].id },
          data: { role: 'ADMIN' },
        });
      }
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};