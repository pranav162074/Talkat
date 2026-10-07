import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import prisma from './config/prisma.js';
import redis from './config/redis.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.get('/health', async (req, res) => {
  const status = { server: 'ok', postgres: 'down', redis: 'down' };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.postgres = 'ok';
  } catch (error) {
    console.error('Health check, Postgres:', error.message);
  }

  try {
    await redis.ping();
    status.redis = 'ok';
  } catch (error) {
    console.error('Health check, Redis:', error.message);
  }

  const healthy = status.postgres === 'ok' && status.redis === 'ok';
  res.status(healthy ? 200 : 503).json(status);
});

app.use('/api/auth', authRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

export default app;