import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { Passport } from 'passport';
import { Strategy } from 'passport-local';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { WorkspaceService, publicUser } from './service.js';
import { asyncRoute, HttpError } from './errors.js';
import {
  id,
  validate,
  registerSchema,
  loginSchema,
  teamSchema,
  memberSchema,
  taskSchema,
  taskUpdateSchema,
  querySchema,
} from './validation.js';

const cookieName = 'teamspace.sid';
const token = () => randomBytes(32).toString('hex');
const safeEqual = (left, right) =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  /^[a-f0-9]{64}$/.test(left) &&
  /^[a-f0-9]{64}$/.test(right) &&
  timingSafeEqual(Buffer.from(left), Buffer.from(right));

export function createApp({ store, config, sessionStore, disableRateLimit = false }) {
  const app = express();
  const service = new WorkspaceService(store);
  const passport = new Passport();
  if (config.production) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: config.production ? undefined : false }));
  app.use(express.json({ limit: '32kb' }));
  let pool;
  if (!sessionStore && config.databaseUrl) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: config.pgSsl });
    pool.on('error', (error) => console.error('PostgreSQL pool error:', error.code || error.name));
    sessionStore = new (connectPgSimple(session))({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    });
  }
  app.use(
    session({
      name: cookieName,
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 12,
      },
    }),
  );
  passport.use(
    new Strategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const user = await service.userByEmail(email);
          // Equal-cost fallback prevents a cheap timing distinction for unknown users.
          const hash =
            user?.passwordHash || '$2b$12$wHw0z2XtlHTFMM.3GCOqauocAc8hCCJdJdwyBvglTWWYGW.m8HDUu';
          const valid = await bcrypt.compare(password, hash);
          done(null, user && valid ? user : false);
        } catch (error) {
          done(error);
        }
      },
    ),
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (userId, done) => {
    try {
      done(null, (await service.user(userId)) || false);
    } catch (error) {
      done(error);
    }
  });
  app.use(passport.initialize());
  app.use(passport.session());

  const api = express.Router();
  if (!disableRateLimit)
    api.use(
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 1500,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { message: 'Too many requests. Please try again shortly.' },
      }),
    );
  api.get('/auth/csrf', (req, res) => {
    req.session.csrfToken ||= token();
    res.set('Cache-Control', 'no-store').json({ csrfToken: req.session.csrfToken });
  });
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && !config.origins.includes(origin))
      return next(new HttpError(403, 'Request origin is not allowed.'));
    if (!safeEqual(req.get('x-csrf-token'), req.session.csrfToken))
      return next(new HttpError(403, 'Your session changed. Refresh the page and try again.'));
    next();
  });
  const authLimiter = disableRateLimit
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { message: 'Too many sign-in attempts. Try again in 15 minutes.' },
      });
  const login = (req, user) =>
    new Promise((resolve, reject) => {
      req.logIn(user, (error) => {
        if (error) return reject(error);
        req.session.csrfToken = token();
        req.session.save((error) => (error ? reject(error) : resolve()));
      });
    });
  api.post(
    '/auth/register',
    authLimiter,
    validate(registerSchema),
    asyncRoute(async (req, res) => {
      const user = await service.register(req.body);
      await login(req, user);
      res.status(201).json({ user: publicUser(user), csrfToken: req.session.csrfToken });
    }),
  );
  api.post('/auth/login', authLimiter, validate(loginSchema), (req, res, next) => {
    passport.authenticate('local', (error, user) => {
      if (error) return next(error);
      if (!user) return res.status(401).json({ message: 'Email or password is incorrect.' });
      login(req, user)
        .then(() => res.json({ user: publicUser(user), csrfToken: req.session.csrfToken }))
        .catch(next);
    })(req, res, next);
  });
  api.use((req, res, next) =>
    req.isAuthenticated()
      ? next()
      : res.status(401).json({ message: 'Please sign in to continue.' }),
  );
  api.get('/auth/me', (req, res) =>
    res.json({ user: publicUser(req.user), csrfToken: req.session.csrfToken }),
  );
  api.post('/auth/logout', (req, res, next) =>
    req.logout((error) => {
      if (error) return next(error);
      req.session.destroy((error) => {
        if (error) return next(error);
        res
          .clearCookie(cookieName, {
            httpOnly: true,
            secure: config.production,
            sameSite: 'lax',
            path: '/',
          })
          .sendStatus(204);
      });
    }),
  );

  api.param('teamId', (req, res, next, value) =>
    id.safeParse(value).success ? next() : next(new HttpError(400, 'Invalid team ID.')),
  );
  api.param('taskId', (req, res, next, value) =>
    id.safeParse(value).success ? next() : next(new HttpError(400, 'Invalid task ID.')),
  );
  api.param('memberId', (req, res, next, value) =>
    id.safeParse(value).success ? next() : next(new HttpError(400, 'Invalid member ID.')),
  );
  api.param('invitationId', (req, res, next, value) =>
    id.safeParse(value).success ? next() : next(new HttpError(400, 'Invalid invitation ID.')),
  );

  api.get(
    '/teams',
    asyncRoute(async (req, res) => res.json({ teams: await service.teams(req.user.id) })),
  );
  api.post(
    '/teams',
    validate(teamSchema),
    asyncRoute(async (req, res) =>
      res.status(201).json({ team: await service.createTeam(req.user.id, req.body) }),
    ),
  );
  api.get(
    '/teams/:teamId',
    asyncRoute(async (req, res) =>
      res.json({ team: await service.team(store, req.params.teamId, req.user.id) }),
    ),
  );
  api.patch(
    '/teams/:teamId',
    validate(teamSchema),
    asyncRoute(async (req, res) =>
      res.json({ team: await service.updateTeam(req.user.id, req.params.teamId, req.body) }),
    ),
  );
  api.delete(
    '/teams/:teamId',
    asyncRoute(async (req, res) => {
      await service.deleteTeam(req.user.id, req.params.teamId);
      res.sendStatus(204);
    }),
  );
  api.get(
    '/teams/:teamId/members',
    asyncRoute(async (req, res) =>
      res.json({ members: await service.members(req.user.id, req.params.teamId) }),
    ),
  );
  api.post(
    '/teams/:teamId/members',
    validate(memberSchema),
    asyncRoute(async (req, res) => {
      await service.addMember(req.user.id, req.params.teamId, req.body.email);
      res.status(201).json({ message: 'Member added.' });
    }),
  );
  api.delete(
    '/teams/:teamId/members/:memberId',
    asyncRoute(async (req, res) => {
      await service.removeMember(req.user.id, req.params.teamId, req.params.memberId);
      res.sendStatus(204);
    }),
  );
  api.post(
    '/teams/:teamId/invitations',
    validate(memberSchema),
    asyncRoute(async (req, res) =>
      res
        .status(201)
        .json({ invitation: await service.invite(req.user.id, req.params.teamId, req.body.email) }),
    ),
  );
  api.get(
    '/invitations',
    asyncRoute(async (req, res) => res.json({ invitations: await service.invitations(req.user) })),
  );
  api.post(
    '/invitations/:invitationId/accept',
    asyncRoute(async (req, res) => {
      await service.respondInvitation(req.user, req.params.invitationId, true);
      res.sendStatus(204);
    }),
  );
  api.post(
    '/invitations/:invitationId/decline',
    asyncRoute(async (req, res) => {
      await service.respondInvitation(req.user, req.params.invitationId, false);
      res.sendStatus(204);
    }),
  );

  api.get(
    '/tasks',
    asyncRoute(async (req, res) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) throw new HttpError(400, 'Invalid task filters.');
      res.json({ tasks: await service.tasks(req.user.id, parsed.data) });
    }),
  );
  api.post(
    '/tasks',
    validate(taskSchema),
    asyncRoute(async (req, res) =>
      res.status(201).json({ task: await service.createTask(req.user.id, req.body) }),
    ),
  );
  api.get(
    '/tasks/:taskId',
    asyncRoute(async (req, res) =>
      res.json({ task: await service.task(req.user.id, req.params.taskId) }),
    ),
  );
  api.patch(
    '/tasks/:taskId',
    validate(taskUpdateSchema),
    asyncRoute(async (req, res) =>
      res.json({ task: await service.updateTask(req.user.id, req.params.taskId, req.body) }),
    ),
  );
  api.delete(
    '/tasks/:taskId',
    asyncRoute(async (req, res) => {
      await service.deleteTask(req.user.id, req.params.taskId);
      res.sendStatus(204);
    }),
  );
  api.get(
    '/reminders',
    asyncRoute(async (req, res) => {
      const today = new Date().toISOString().slice(0, 10);
      const through = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const tasks = await service.tasks(req.user.id, { assigneeId: req.user.id });
      res.json({
        today,
        through,
        tasks: tasks
          .filter((task) => task.status !== 'done' && task.dueDate && task.dueDate <= through)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      });
    }),
  );
  api.use((req, res) => res.status(404).json({ message: 'API route not found.' }));
  app.use('/api', api);
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  app.use(express.static(dist, { index: false }));
  // The HTML shell is public so sign-in can render. Workspace APIs and data require a session.
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error('Request failed:', error.code || error.name);
    const message =
      status >= 500
        ? 'The server could not complete the request. Please try again.'
        : error.message;
    res.status(status).json({ message });
  });
  return {
    app,
    pool,
    service,
    close: async () => {
      sessionStore?.close?.();
      await pool?.end();
    },
  };
}
