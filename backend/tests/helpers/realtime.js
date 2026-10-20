import http from 'http';
import { io as connect } from 'socket.io-client';
import app from '../../src/app.js';
import prisma from '../../src/config/prisma.js';
import redis from '../../src/config/redis.js';
import { initSocket } from '../../src/sockets/index.js';
import { generateToken } from '../../src/utils/token.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Filled in by setupRealtime(): three users, their tokens and two direct conversations.
// A and B share a chat (ab), A and C share a chat (ac), and B and C share nothing.
export const fixture = { tokens: {} };

let server;
let io;
let baseUrl;
const openSockets = [];

const makeUser = (name, email) =>
  prisma.user.create({ data: { name, email, isEmailVerified: true } });

const makeDirect = (x, y) =>
  prisma.conversation.create({
    data: {
      type: 'DIRECT',
      directKey: [x.id, y.id].sort().join('_'),
      participants: { create: [{ userId: x.id }, { userId: y.id }] },
    },
  });

export async function setupRealtime() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const [a, b, c] = await Promise.all([
    makeUser('Alice RT', `rt-a-${stamp}@example.com`),
    makeUser('Bob RT', `rt-b-${stamp}@example.com`),
    makeUser('Carol RT', `rt-c-${stamp}@example.com`),
  ]);
  Object.assign(fixture, { a, b, c });
  fixture.tokens = { a: generateToken(a.id), b: generateToken(b.id), c: generateToken(c.id) };

  // These exist before any socket connects, so they are joined during the handshake
  fixture.ab = await makeDirect(a, b);
  fixture.ac = await makeDirect(a, c);

  // The same setup as server.js, on a random free port
  server = http.createServer(app);
  io = initSocket(server);
  app.set('io', io); // REST controllers emit their events through this
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // initSocket clears stale presence keys in the background, so give it a moment
  await sleep(150);
}

export async function teardownRealtime() {
  openSockets.splice(0).forEach((socket) => socket.close());
  await new Promise((resolve) => io.close(resolve)); // also closes the HTTP server

  const ids = [fixture.a.id, fixture.b.id, fixture.c.id];
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId: { in: ids } } } },
    select: { id: true },
  });

  // Deleting the conversations cascades to participants and messages
  await prisma.conversation.deleteMany({ where: { id: { in: conversations.map((c) => c.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await redis.del(
    ...ids.map((id) => `presence:${id}`),
    ...ids.map((id) => `visible:${id}`),
    ...conversations.map((c) => `chat:${c.id}:recent`)
  );

  await prisma.$disconnect();
  redis.disconnect();
}

// Tries to connect. Resolves with { socket } on success, or { error } if the server refuses.
export const attempt = (auth) =>
  new Promise((resolve) => {
    const socket = connect(baseUrl, {
      auth,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    openSockets.push(socket);

    // Listen before the connection opens, because the server sends this right after the handshake
    socket.snapshot = new Promise((done) => socket.once('presence:snapshot', done));

    socket.once('connect', () => resolve({ socket }));
    socket.once('connect_error', (error) => {
      socket.close();
      resolve({ error });
    });
  });

// Connects as user 'a', 'b' or 'c'
export const connectAs = async (name) => {
  const { socket, error } = await attempt({ token: fixture.tokens[name] });
  if (error) throw error;
  return socket;
};

// Closes every socket and waits until the server has processed the disconnects, so
// one test's "went offline" broadcast can't leak into the next test
export const closeAll = async () => {
  openSockets.splice(0).forEach((socket) => socket.close());

  const keys = [fixture.a, fixture.b, fixture.c].map((user) => `presence:${user.id}`);
  for (let i = 0; i < 40; i += 1) {
    const counts = await Promise.all(keys.map((key) => redis.scard(key)));
    if (counts.every((count) => count === 0)) break;
    await sleep(50);
  }
  await sleep(50);
};

// Resolves with the first event that passes the filter. Call it BEFORE the action that
// causes the event, then await the result afterwards, so the event can't be missed.
export const waitFor = (socket, event, predicate = () => true, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);

    function onEvent(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    }

    socket.on(event, onEvent);
  });

// Records every matching event for a while. Used to prove that something did NOT arrive.
// Call it before the action, and await the result after.
export const collect = async (socket, event, ms = 400) => {
  const received = [];
  const onEvent = (payload) => received.push(payload);
  socket.on(event, onEvent);
  await sleep(ms);
  socket.off(event, onEvent);
  return received;
};

// Emits an event and resolves with the server's acknowledgement
export const emitAck = (socket, event, payload, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, response) =>
      err ? reject(err) : resolve(response)
    );
});