import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault, ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default';
import pinoHttp from 'pino-http';
import { GraphQLError } from 'graphql';

import { typeDefs } from './graphql/schema/index.js';
import { resolvers } from './graphql/resolvers/index.js';
import { buildContext } from './graphql/context.js';
import { logger } from './utils/logger.js';
import db from './db/connection.js';

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const app = express();
  const httpServer = http.createServer(app);

  // ── Structured request logging ──
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // ── CORS: the three frontends (customer/franchise app, admin panel, and
  //    local dev tooling) are explicitly allow-listed via env, never `*`,
  //    since requests carry Authorization bearer tokens. ──
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));

  // ── Health check (used by load balancers / uptime monitors / Docker) ──
  app.get('/health', async (_req, res) => {
    try {
      await db.raw('SELECT 1');
      res.status(200).json({ status: 'ok', db: 'connected', env: NODE_ENV });
    } catch (err) {
      res.status(503).json({ status: 'error', db: 'unreachable', error: err.message });
    }
  });

  // ── Apollo Server ──
  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: NODE_ENV !== 'production',
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      NODE_ENV === 'production'
        ? ApolloServerPluginLandingPageProductionDefault({ footer: false })
        : ApolloServerPluginLandingPageLocalDefault({ embed: true, footer: false }),
    ],
    // Normalizes thrown errors into a consistent shape and avoids leaking
    // stack traces / internal SQL errors to clients in production.
    formatError: (formattedError, error) => {
      logger.error({ err: error }, 'GraphQL error');

      if (NODE_ENV === 'production' && formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        return new GraphQLError('Something went wrong. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
      return formattedError;
    },
  });

  await apollo.start();

  app.use(
    '/graphql',
    expressMiddleware(apollo, {
      context: buildContext,
    })
  );

  await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));
  logger.info(`🚀 Estatiq API ready at http://localhost:${PORT}/graphql (${NODE_ENV})`);
  logger.info(`   Allowed origins: ${CORS_ORIGINS.join(', ')}`);

  // ── Graceful shutdown: stop accepting new connections, drain in-flight
  //    requests, then close the DB pool — important under PM2/Docker/k8s
  //    SIGTERM, and for not leaving the connection pool dangling in dev. ──
  const shutdown = async (signal) => {
    logger.info(`${signal} received: shutting down gracefully...`);
    await apollo.stop();
    httpServer.close(async () => {
      await db.destroy();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during server startup');
  process.exit(1);
});
