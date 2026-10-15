-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "tagline" TEXT NOT NULL DEFAULT 'Hey! I''m on Talkat';
