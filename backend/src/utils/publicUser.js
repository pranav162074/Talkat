// Never send the password hash or other internal fields to the client
export const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  bio: user.bio,
  tagline: user.tagline,
  authProvider: user.authProvider,
  isEmailVerified: user.isEmailVerified,
  createdAt: user.createdAt,
});