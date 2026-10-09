import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email');

// bcrypt only uses the first 72 bytes of a password, so we cap the length there
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50, 'Name is too long'),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const verifyOtpSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const resendOtpSchema = z.object({ email });

export const googleSchema = z.object({
  credential: z.string().min(1, 'Google credential is required'),
});

const uuid = z.string().uuid('Invalid id');

export const directConversationSchema = z.object({ userId: uuid });

export const groupConversationSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(50, 'Group name is too long'),
  memberIds: z.array(uuid).min(1, 'Add at least one member').max(99, 'Too many members'),
});

export const addParticipantsSchema = z.object({
  userIds: z.array(uuid).min(1, 'Select at least one user').max(50, 'Too many users at once'),
});