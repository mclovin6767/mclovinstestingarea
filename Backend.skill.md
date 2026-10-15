name: backend
description: Production-grade backend API development. Use when the user asks to build REST APIs, GraphQL endpoints, background jobs, webhooks, middleware, business logic layers, or server-side services. Trigger on: "API endpoint", "route handler", "controller", "service layer", "middleware", "background job", "cron job", "webhook handler", "validation", "error handling", "Node.js", "Express", "Fastify", "NestJS", "FastAPI", "Spring Boot". Pairs with: database.skill.md (data layer), auth.skill.md (authentication), security.skill.md (hardening), testing.skill.md (API tests).
This skill produces secure, well-structured, maintainable backend code following layered architecture principles. It covers API design, request handling, validation, error handling, background processing, and service patterns.
Architecture Layers
Follow a strict separation of concerns:
Request → Router → Middleware → Controller → Service → Repository → Database
                      ↓                         ↓
                  Validation              Business Logic

Router: URL routing only. No logic.
Middleware: Cross-cutting concerns (auth, logging, rate limiting, CORS).
Controller: HTTP concern only. Parse request, call service, return response.
Service: Business logic. No HTTP knowledge. Reusable.
Repository: Database queries only. No business logic.
Models/Types: Shared data shapes.


Project Structure (Node.js / Fastify)
/src
  /routes          # Route definitions
  /controllers     # HTTP handlers
  /services        # Business logic
  /repositories    # DB queries
  /middleware      # Auth, logging, rate limit
  /validators      # Zod/Joi schemas
  /models          # TypeScript types / Prisma models
  /jobs            # Background jobs (BullMQ)
  /events          # Domain event emitters/handlers
  /lib             # DB client, Redis, mailer, etc.
  /utils           # Pure utility functions
  /config          # Env config, constants
  /errors          # Custom error classes
/tests
  /unit
  /integration
  /e2e

REST API Design
Resource Naming
GET    /users              # List users
POST   /users              # Create user
GET    /users/:id          # Get user
PATCH  /users/:id          # Partial update
PUT    /users/:id          # Full replace
DELETE /users/:id          # Delete user

# Nested resources
GET    /users/:id/posts    # User's posts
POST   /users/:id/posts    # Create post for user

# Actions (non-CRUD)
POST   /users/:id/activate
POST   /payments/:id/refund
POST   /auth/refresh-token
Response Format (Consistent)
typescript// Success
{
  "data": { ... },           // or array
  "meta": {                  // for lists
    "total": 100,
    "page": 1,
    "limit": 20,
    "hasNext": true
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is invalid",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ],
    "requestId": "req_abc123"
  }
}
HTTP Status Codes
SituationCodeSuccess (with body)200 OKCreated201 CreatedSuccess (no body)204 No ContentBad request / validation400 Bad RequestUnauthenticated401 UnauthorizedForbidden403 ForbiddenNot found404 Not FoundConflict (duplicate)409 ConflictRate limited429 Too Many RequestsServer error500 Internal Server Error

Fastify Example (TypeScript)
typescript// src/routes/users.ts
import { FastifyPluginAsync } from "fastify";
import { UserController } from "../controllers/UserController";
import { createUserSchema, getUserSchema } from "../validators/userSchemas";

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  const controller = new UserController(fastify);

  fastify.post("/users", {
    schema: { body: createUserSchema },
    preHandler: [fastify.authenticate],
    handler: controller.create,
  });

  fastify.get("/users/:id", {
    schema: { params: getUserSchema },
    preHandler: [fastify.authenticate],
    handler: controller.getById,
  });
};
typescript// src/controllers/UserController.ts
import { FastifyReply, FastifyRequest } from "fastify";
import { UserService } from "../services/UserService";
import { CreateUserInput } from "../validators/userSchemas";

export class UserController {
  private userService: UserService;

  constructor(fastify: FastifyInstance) {
    this.userService = new UserService(fastify.db);
    this.create = this.create.bind(this);
    this.getById = this.getById.bind(this);
  }

  async create(req: FastifyRequest<{ Body: CreateUserInput }>, reply: FastifyReply) {
    const user = await this.userService.create(req.body);
    reply.code(201).send({ data: user });
  }

  async getById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = await this.userService.findById(req.params.id);
    if (!user) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
    reply.send({ data: user });
  }
}
typescript// src/services/UserService.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { ConflictError, NotFoundError } from "../errors";
import { CreateUserInput } from "../validators/userSchemas";

export class UserService {
  constructor(private db: PrismaClient) {}

  async create(input: CreateUserInput) {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("Email already registered");

    const hashedPassword = await bcrypt.hash(input.password, 12);
    return this.db.user.create({
      data: { ...input, password: hashedPassword },
      select: { id: true, email: true, name: true, createdAt: true }, // never return password
    });
  }

  async findById(id: string) {
    return this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }
}

Validation with Zod
typescript// src/validators/userSchemas.ts
import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100)
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[0-9]/, "Must contain number"),
  name: z.string().min(2).max(100).trim(),
  role: z.enum(["user", "admin"]).default("user"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

Error Handling
typescript// src/errors/index.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Permission denied") {
    super("FORBIDDEN", message, 403);
  }
}

// Global error handler (Fastify)
fastify.setErrorHandler((error, request, reply) => {
  const requestId = request.id;

  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      error: { code: error.code, message: error.message, requestId },
    });
  }

  // Zod validation error
  if (error.validation) {
    return reply.code(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.validation,
        requestId,
      },
    });
  }

  // Log unexpected errors
  request.log.error({ err: error, requestId });
  reply.code(500).send({
    error: { code: "INTERNAL_ERROR", message: "Internal server error", requestId },
  });
});

Middleware Patterns
typescript// Rate limiting (fastify-rate-limit)
await fastify.register(import("@fastify/rate-limit"), {
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.user?.id ?? req.ip,
  errorResponseBuilder: () => ({
    error: { code: "RATE_LIMITED", message: "Too many requests" },
  }),
});

// Request ID + logging
fastify.addHook("onRequest", async (request) => {
  request.id = request.headers["x-request-id"] as string ?? generateId();
});

// Response time header
fastify.addHook("onSend", async (request, reply) => {
  reply.header("X-Response-Time", `${Date.now() - request.startTime}ms`);
});

Background Jobs (BullMQ + Redis)
typescript// src/jobs/queues.ts
import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis";

export const emailQueue = new Queue("email", { connection: redis });
export const reportQueue = new Queue("report", { connection: redis });

// Producer
await emailQueue.add("welcome", { userId, email }, {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
});

// Consumer
const emailWorker = new Worker("email", async (job) => {
  if (job.name === "welcome") {
    await sendWelcomeEmail(job.data);
  }
}, { connection: redis, concurrency: 5 });

emailWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Email job failed");
});

Webhooks
typescript// src/routes/webhooks.ts — Stripe example
fastify.post("/webhooks/stripe", {
  config: { rawBody: true }, // Need raw body for signature verification
}, async (req, reply) => {
  const sig = req.headers["stripe-signature"];
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return reply.code(400).send({ error: "Invalid signature" });
  }

  // Process asynchronously — respond fast, process in background
  await webhookQueue.add(event.type, event);
  reply.send({ received: true });
});

Environment Configuration
typescript// src/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
});

export const env = envSchema.parse(process.env);
// Throws on startup if any required env var is missing or invalid

Logging
Use structured JSON logging (Pino):
typescript// Always include: requestId, userId (when available), duration, error details
logger.info({ requestId, userId, action: "user.created", duration: 120 }, "User created");
logger.error({ requestId, err: { message, stack }, input: sanitize(input) }, "Unexpected error");

// Never log: passwords, tokens, PII (emails/phones in prod), payment card data

Health Check Endpoints
typescriptfastify.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

fastify.get("/health/deep", async () => {
  const [dbOk, redisOk] = await Promise.all([
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then(r => r === "PONG").catch(() => false),
  ]);
  const healthy = dbOk && redisOk;
  return {
    status: healthy ? "ok" : "degraded",
    checks: { database: dbOk, cache: redisOk },
  };
});