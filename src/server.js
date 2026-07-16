import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from '@apollo/server/plugin/landingPage/default';
import pinoHttp from 'pino-http';
import { GraphQLError } from 'graphql';

import { typeDefs }     from './graphql/schema/index.js';
import { resolvers }    from './graphql/resolvers/index.js';
import { buildContext } from './graphql/context.js';
import { logger }       from './utils/logger.js';
import db               from './db/connection.js';

const PORT     = process.env.PORT     || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Default includes localhost dev + the live Vercel frontend + live Vercel admin.
// Override in production via CORS_ORIGINS env var (comma-separated list).
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://realestate-react-rho.vercel.app',
];

const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

async function main() {
  const app        = express();
  const httpServer = http.createServer(app);

  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/health' },
  }));

  // CORS — explicit allowlist, never wildcard (requests carry bearer tokens)
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, Apollo Studio, server-to-server)
      if (!origin) return callback(null, true);
      if (CORS_ORIGINS.includes(origin)) return callback(null, true);
      logger.warn({ origin }, 'CORS blocked request');
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '2mb' }));

  // Health check — used by Render, uptime monitors
  app.get('/health', async (_req, res) => {
    try {
      await db.raw('SELECT 1');
      res.status(200).json({ status: 'ok', db: 'connected', env: NODE_ENV });
    } catch (err) {
      res.status(503).json({ status: 'error', db: 'unreachable', error: err.message });
    }
  });

  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,   // keep on so Apollo Studio / curl can introspect
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      NODE_ENV === 'production'
        ? ApolloServerPluginLandingPageProductionDefault({ footer: false })
        : ApolloServerPluginLandingPageLocalDefault({ embed: true, footer: false }),
    ],
    formatError: (formattedError, error) => {
      logger.error({ err: error }, 'GraphQL error');
      // Don't leak internal details in production
      if (NODE_ENV === 'production' &&
          formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        return new GraphQLError('Something went wrong. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
      return formattedError;
    },
  });

  await apollo.start();

  app.use('/graphql', expressMiddleware(apollo, { context: buildContext }));

  await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));
  logger.info(`🚀 Estatiq API ready → http://localhost:${PORT}/graphql  [${NODE_ENV}]`);
  logger.info(`   CORS origins: ${CORS_ORIGINS.join(', ')}`);

  const shutdown = async (signal) => {
    logger.info(`${signal} — shutting down…`);
    await apollo.stop();
    httpServer.close(async () => {
      await db.destroy();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
