# Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NestJS + MongoDB backend API for the employee attendance & location tracking system (auth, users, offices, attendance, location).

**Architecture:** NestJS modular monolith (one module per domain area), Mongoose schemas with indexes defined at creation time, stateless JWT auth issued after Google OAuth verification, REST API consumed later by the mobile app.

**Tech Stack:** Node.js, NestJS, TypeScript (strict), MongoDB + Mongoose, Jest + Supertest, `google-auth-library`, `@nestjs/jwt`, `@nestjs/throttler`, `class-validator`/`class-transformer`.

**Spec:** `docs/superpowers/specs/2026-09-14-employee-attendance-system-design.md`

## Global Constraints

- TypeScript strict mode in `backend`.
- No endpoint returns an unbounded list — pagination is mandatory (`?page=&limit=`, max `limit=100`).
- Every Mongo collection's indexes are defined alongside its schema, in the same task that creates the schema.
- JWT access token TTL 15 min, refresh token TTL 30 days.
- Every admin-only route has both an auth guard (`JwtAuthGuard`) and a roles guard (`RolesGuard`).
- All secrets (Google client ID, JWT signing secret, Mongo URI) come from environment variables, never hardcoded; `.env` is gitignored.
- `POST /location/ping` is only ever accepted while the caller has an open `AttendanceRecord`.

---

## File Structure

```
backend/
  src/
    main.ts
    app.module.ts
    config/
      env.validation.ts
    common/
      guards/jwt-auth.guard.ts
      guards/roles.guard.ts
      decorators/roles.decorator.ts
      decorators/current-user.decorator.ts
      dto/pagination.dto.ts
    users/
      schemas/user.schema.ts
      users.module.ts
      users.service.ts
      users.controller.ts
      dto/update-user.dto.ts
    offices/
      schemas/office.schema.ts
      offices.module.ts
      offices.service.ts
      offices.controller.ts
      dto/create-office.dto.ts
      dto/update-office.dto.ts
    attendance/
      schemas/attendance-record.schema.ts
      attendance.module.ts
      attendance.service.ts
      attendance.controller.ts
      dto/clock-in.dto.ts
      dto/clock-out.dto.ts
      geo.util.ts
    location/
      schemas/location-ping.schema.ts
      location.module.ts
      location.service.ts
      location.controller.ts
      dto/ping.dto.ts
    auth/
      auth.module.ts
      auth.service.ts
      auth.controller.ts
      jwt.strategy.ts
      dto/google-login.dto.ts
      dto/refresh.dto.ts
  scripts/
    seed-admins.ts
  test/ (e2e)
  .env.example
```

Each domain module (`users`, `offices`, `attendance`, `location`, `auth`) owns its own schema, service, controller, and DTOs — no shared "models" folder. `common/` holds only cross-cutting guards/decorators used by every module.

---

## Task 1: Project scaffolding, config, and health check

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/nest-cli.json`
- Create: `backend/src/main.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/config/env.validation.ts`
- Create: `backend/.env.example`
- Create: `backend/src/app.controller.ts`
- Test: `backend/test/health.e2e-spec.ts`

**Interfaces:**
- Produces: `AppModule` (root module later tasks import into), a running Nest app on `PORT` env var, `GET /health` returning `{ status: 'ok' }`.

- [ ] **Step 1: Scaffold the NestJS project**

Run:
```bash
cd backend
npx @nestjs/cli new . --package-manager npm --skip-git --language typescript
```
When prompted, accept defaults. This creates `package.json`, `tsconfig.json`, `nest-cli.json`, `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`, `src/app.service.ts`, and a starter `test/app.e2e-spec.ts`.

- [ ] **Step 2: Install additional dependencies**

Run:
```bash
npm install @nestjs/mongoose mongoose @nestjs/jwt @nestjs/passport passport passport-jwt @nestjs/throttler @nestjs/config google-auth-library class-validator class-transformer
npm install -D @types/passport-jwt supertest
```

- [ ] **Step 3: Enable TypeScript strict mode**

Edit `backend/tsconfig.json`, set inside `compilerOptions`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

- [ ] **Step 4: Write environment validation**

Create `backend/src/config/env.validation.ts`:
```typescript
import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsInt()
  PORT: number;

  @IsString()
  @MinLength(1)
  MONGO_URI: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @MinLength(1)
  GOOGLE_CLIENT_ID: string;

  @IsString()
  @MinLength(1)
  ALLOWED_GOOGLE_DOMAIN: string;

  @IsString()
  ADMIN_EMAILS: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
```

- [ ] **Step 5: Create `.env.example`**

Create `backend/.env.example`:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/attendance
JWT_ACCESS_SECRET=change-me-to-a-random-32-char-string
JWT_REFRESH_SECRET=change-me-to-a-different-32-char-string
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
ALLOWED_GOOGLE_DOMAIN=yourcompany.com
ADMIN_EMAILS=you@yourcompany.com
```

Copy it to a real `.env` for local dev (`cp .env.example .env`) and fill in real values — `.env` must already be in `.gitignore` (Nest's default `.gitignore` includes it; verify with `cat backend/.gitignore`).

- [ ] **Step 6: Wire ConfigModule with validation into AppModule**

Replace `backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 7: Write the failing health check test**

Create `backend/test/health.e2e-spec.ts` (delete the generated `test/app.e2e-spec.ts` first since it tests a route we're replacing):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm run test:e2e -- health.e2e-spec.ts`
Expected: FAIL — `GET /health` returns 404 (no such route yet).

- [ ] **Step 9: Implement the health endpoint**

Replace `backend/src/app.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
```

Delete `backend/src/app.service.ts` if the generated `AppController` no longer depends on it (it doesn't in the version above).

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm run test:e2e -- health.e2e-spec.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add backend/
git commit -m "chore: scaffold NestJS backend with config validation and health check"
```

---

## Task 2: User schema with indexes

**Files:**
- Create: `backend/src/users/schemas/user.schema.ts`
- Test: `backend/src/users/schemas/user.schema.spec.ts`
- Modify: `backend/src/app.module.ts` (register `MongooseModule.forRoot`)

**Interfaces:**
- Consumes: `MONGO_URI` from `ConfigService` (Task 1).
- Produces: `User`, `UserDocument`, `UserSchema` — used by `auth` (Task 6), `users` (Task 9), `attendance` (Task 11) to reference `userId`.

- [ ] **Step 1: Write the failing schema test**

Create `backend/src/users/schemas/user.schema.spec.ts`:
```typescript
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User, UserDocument, UserSchema } from './user.schema';

describe('UserSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<UserDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
      ],
    }).compile();
    model = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates a user with default role employee', async () => {
    const user = await model.create({
      googleId: 'g-123',
      email: 'jane@example.com',
      name: 'Jane Doe',
    });
    expect(user.role).toBe('employee');
    expect(user.officeIds).toEqual([]);
  });

  it('enforces a unique index on email', async () => {
    await model.create({ googleId: 'g-1', email: 'dup@example.com', name: 'A' });
    await expect(
      model.create({ googleId: 'g-2', email: 'dup@example.com', name: 'B' }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Install the in-memory Mongo test dependency**

Run: `npm install -D mongodb-memory-server`

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- user.schema.spec.ts`
Expected: FAIL — cannot find module `./user.schema`.

- [ ] **Step 4: Implement the schema**

Create `backend/src/users/schemas/user.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'employee' | 'admin';
export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  googleId: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['employee', 'admin'], default: 'employee' })
  role: UserRole;

  @Prop({ type: [Types.ObjectId], ref: 'Office', default: [] })
  officeIds: Types.ObjectId[];

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
```

The `unique: true` on `googleId` and `email` in `@Prop` makes Mongoose build the required unique indexes automatically — no separate `schema.index()` calls needed for these two.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- user.schema.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 6: Register MongooseModule.forRoot in AppModule**

Modify `backend/src/app.module.ts` — add the import:
```typescript
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
```
and inside `imports: []`, after `ConfigModule.forRoot(...)`, add:
```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    uri: config.get<string>('MONGO_URI'),
  }),
}),
```

- [ ] **Step 7: Run the full test suite to verify nothing broke**

Run: `npm run test && npm run test:e2e`
Expected: PASS (requires a local MongoDB running for the app to boot in the e2e health test — start one with `docker run -d -p 27017:27017 mongo:7` if not already running, or point `MONGO_URI` in `.env` at an existing instance)

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: add User schema with unique indexes on googleId and email"
```

---

## Task 3: Office schema with geospatial index

**Files:**
- Create: `backend/src/offices/schemas/office.schema.ts`
- Test: `backend/src/offices/schemas/office.schema.spec.ts`

**Interfaces:**
- Produces: `Office`, `OfficeDocument`, `OfficeSchema` — used by `attendance` (Task 11, geofence distance check) and `users` (`officeIds` reference, Task 2).

- [ ] **Step 1: Write the failing schema test**

Create `backend/src/offices/schemas/office.schema.spec.ts`:
```typescript
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Office, OfficeDocument, OfficeSchema } from './office.schema';

describe('OfficeSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<OfficeDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Office.name, schema: OfficeSchema }]),
      ],
    }).compile();
    model = moduleRef.get<Model<OfficeDocument>>(getModelToken(Office.name));
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates an office with a GeoJSON Point location', async () => {
    const office = await model.create({
      name: 'HQ',
      address: '1 Main St',
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      radiusMeters: 150,
    });
    expect(office.location.coordinates).toEqual([77.5946, 12.9716]);
  });

  it('finds offices near a point using the 2dsphere index', async () => {
    const nearOffice = await model.findOne({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [77.595, 12.972] },
          $maxDistance: 5000,
        },
      },
    });
    expect(nearOffice).not.toBeNull();
    expect(nearOffice!.name).toBe('HQ');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- office.schema.spec.ts`
Expected: FAIL — cannot find module `./office.schema`.

- [ ] **Step 3: Implement the schema**

Create `backend/src/offices/schemas/office.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OfficeDocument = Office & Document;

class GeoPoint {
  @Prop({ required: true, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ required: true, type: [Number] })
  coordinates: [number, number]; // [lng, lat]
}

@Schema({ timestamps: true })
export class Office {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true, type: GeoPoint })
  location: GeoPoint;

  @Prop({ required: true, min: 10, max: 2000 })
  radiusMeters: number;
}

export const OfficeSchema = SchemaFactory.createForClass(Office);
OfficeSchema.index({ location: '2dsphere' });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- office.schema.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: add Office schema with 2dsphere geospatial index"
```

---

## Task 4: AttendanceRecord schema with compound index

**Files:**
- Create: `backend/src/attendance/schemas/attendance-record.schema.ts`
- Test: `backend/src/attendance/schemas/attendance-record.schema.spec.ts`

**Interfaces:**
- Consumes: `User` (Task 2, via `userId` reference), `Office` (Task 3, via `officeId` reference).
- Produces: `AttendanceRecord`, `AttendanceRecordDocument`, `AttendanceRecordSchema` — used by `attendance.service.ts` (Tasks 11-13) and `location.service.ts` (Task 14, to check for an open record).

- [ ] **Step 1: Write the failing schema test**

Create `backend/src/attendance/schemas/attendance-record.schema.spec.ts`:
```typescript
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
  AttendanceRecordSchema,
} from './attendance-record.schema';

describe('AttendanceRecordSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<AttendanceRecordDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
        ]),
      ],
    }).compile();
    model = moduleRef.get<Model<AttendanceRecordDocument>>(
      getModelToken(AttendanceRecord.name),
    );
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates an open attendance record on clock-in', async () => {
    const record = await model.create({
      userId: new Types.ObjectId(),
      officeId: new Types.ObjectId(),
      clockIn: { time: new Date(), location: { lat: 12.97, lng: 77.59 } },
      status: 'open',
    });
    expect(record.status).toBe('open');
    expect(record.clockOut).toBeNull();
  });

  it('finds the open record for a user via the compound index query', async () => {
    const userId = new Types.ObjectId();
    await model.create({
      userId,
      officeId: new Types.ObjectId(),
      clockIn: { time: new Date(), location: { lat: 12.97, lng: 77.59 } },
      status: 'open',
    });
    const open = await model.findOne({ userId, status: 'open' });
    expect(open).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- attendance-record.schema.spec.ts`
Expected: FAIL — cannot find module `./attendance-record.schema`.

- [ ] **Step 3: Implement the schema**

Create `backend/src/attendance/schemas/attendance-record.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AttendanceStatus = 'open' | 'closed';
export type AttendanceRecordDocument = AttendanceRecord & Document;

class ClockEvent {
  @Prop({ required: true })
  time: Date;

  @Prop({ type: { lat: Number, lng: Number }, required: true })
  location: { lat: number; lng: number };
}

@Schema({ timestamps: true })
export class AttendanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Office', required: true })
  officeId: Types.ObjectId;

  @Prop({ type: ClockEvent, required: true })
  clockIn: ClockEvent;

  @Prop({ type: ClockEvent, default: null })
  clockOut: ClockEvent | null;

  @Prop({ required: true, enum: ['open', 'closed'], default: 'open' })
  status: AttendanceStatus;
}

export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);
AttendanceRecordSchema.index({ userId: 1, 'clockIn.time': -1 });
AttendanceRecordSchema.index({ userId: 1, status: 1 });
```

The second index (`{ userId: 1, status: 1 }`) supports the frequent "does this user have an open record" lookup used by clock-in (Task 12) and location ping (Task 14) — it's not in the spec's index table explicitly but is required by the "reject clock-in if already open" and "reject ping if not open" constraints, so it belongs with the schema that defines `status`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- attendance-record.schema.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: add AttendanceRecord schema with userId+time and userId+status indexes"
```

---

## Task 5: LocationPing schema with TTL index

**Files:**
- Create: `backend/src/location/schemas/location-ping.schema.ts`
- Test: `backend/src/location/schemas/location-ping.schema.spec.ts`

**Interfaces:**
- Consumes: `User` (Task 2, via `userId` reference).
- Produces: `LocationPing`, `LocationPingDocument`, `LocationPingSchema` — used by `location.service.ts` (Tasks 14-15).

- [ ] **Step 1: Write the failing schema test**

Create `backend/src/location/schemas/location-ping.schema.spec.ts`:
```typescript
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  LocationPing,
  LocationPingDocument,
  LocationPingSchema,
} from './location-ping.schema';

describe('LocationPingSchema', () => {
  let mongod: MongoMemoryServer;
  let model: Model<LocationPingDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: LocationPing.name, schema: LocationPingSchema },
        ]),
      ],
    }).compile();
    model = moduleRef.get<Model<LocationPingDocument>>(
      getModelToken(LocationPing.name),
    );
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates a location ping', async () => {
    const ping = await model.create({
      userId: new Types.ObjectId(),
      location: { type: 'Point', coordinates: [77.59, 12.97] },
      timestamp: new Date(),
    });
    expect(ping.location.coordinates).toEqual([77.59, 12.97]);
  });

  it('defines a TTL index on timestamp expiring after 60 days', async () => {
    const indexes = await model.collection.indexes();
    const ttlIndex = indexes.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex!.expireAfterSeconds).toBe(60 * 24 * 60 * 60);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- location-ping.schema.spec.ts`
Expected: FAIL — cannot find module `./location-ping.schema`.

- [ ] **Step 3: Implement the schema**

Create `backend/src/location/schemas/location-ping.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LocationPingDocument = LocationPing & Document;

class GeoPoint {
  @Prop({ required: true, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ required: true, type: [Number] })
  coordinates: [number, number]; // [lng, lat]
}

@Schema()
export class LocationPing {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: GeoPoint })
  location: GeoPoint;

  @Prop({ required: true })
  timestamp: Date;
}

export const LocationPingSchema = SchemaFactory.createForClass(LocationPing);
LocationPingSchema.index({ userId: 1, timestamp: -1 });
LocationPingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- location-ping.schema.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: add LocationPing schema with 60-day TTL index"
```

---

## Task 6: Auth — Google sign-in + JWT issuance

**Files:**
- Create: `backend/src/auth/dto/google-login.dto.ts`
- Create: `backend/src/auth/google-verifier.service.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.module.ts`
- Create: `backend/src/users/users.module.ts`, `backend/src/users/users.service.ts` (minimal — `findOrCreateByGoogle`, `findById`)
- Test: `backend/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `User`/`UserSchema` (Task 2), `ConfigService` (Task 1) for `GOOGLE_CLIENT_ID`, `ALLOWED_GOOGLE_DOMAIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
- Produces: `AuthService.loginWithGoogle(idToken: string): Promise<{ accessToken: string; refreshToken: string; user: UserDocument }>`, `POST /auth/google` route. `GoogleVerifierService.verify(idToken: string): Promise<{ email: string; name: string; googleId: string }>` — used directly by `AuthService` and mockable in tests.

- [ ] **Step 1: Write the failing service test**

Create `backend/src/auth/auth.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { GoogleVerifierService } from './google-verifier.service';
import { User } from '../users/schemas/user.schema';

describe('AuthService', () => {
  let service: AuthService;
  let userModel: any;
  let googleVerifier: { verify: jest.Mock };

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    googleVerifier = { verify: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: GoogleVerifierService, useValue: googleVerifier },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                ALLOWED_GOOGLE_DOMAIN: 'example.com',
                JWT_ACCESS_SECRET: 'a'.repeat(32),
                JWT_REFRESH_SECRET: 'b'.repeat(32),
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('creates a new employee user on first Google login', async () => {
    googleVerifier.verify.mockResolvedValue({
      email: 'new@example.com',
      name: 'New Person',
      googleId: 'g-999',
    });
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockResolvedValue({
      _id: 'u1',
      email: 'new@example.com',
      role: 'employee',
    });

    const result = await service.loginWithGoogle('fake-id-token');

    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', googleId: 'g-999' }),
    );
    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toBe('signed-token');
    expect(result.user.email).toBe('new@example.com');
  });

  it('rejects a login from outside the allowed Google domain', async () => {
    googleVerifier.verify.mockResolvedValue({
      email: 'outsider@other.com',
      name: 'Outsider',
      googleId: 'g-000',
    });

    await expect(service.loginWithGoogle('fake-id-token')).rejects.toThrow(
      'domain not allowed',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- auth.service.spec.ts`
Expected: FAIL — cannot find module `./auth.service`.

- [ ] **Step 3: Implement `GoogleVerifierService`**

Create `backend/src/auth/google-verifier.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  email: string;
  name: string;
  googleId: string;
}

@Injectable()
export class GoogleVerifierService {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.client = new OAuth2Client(this.config.get<string>('GOOGLE_CLIENT_ID'));
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      throw new Error('invalid Google token payload');
    }
    return {
      email: payload.email,
      name: payload.name ?? payload.email,
      googleId: payload.sub,
    };
  }
}
```

- [ ] **Step 4: Implement `AuthService`**

Create `backend/src/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from '../users/schemas/user.schema';
import { GoogleVerifierService } from './google-verifier.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserDocument;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly googleVerifier: GoogleVerifierService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async loginWithGoogle(idToken: string): Promise<AuthTokens> {
    const profile = await this.googleVerifier.verify(idToken);
    const allowedDomain = this.config.get<string>('ALLOWED_GOOGLE_DOMAIN');
    const emailDomain = profile.email.split('@')[1];
    if (allowedDomain && emailDomain !== allowedDomain) {
      throw new UnauthorizedException('domain not allowed');
    }

    let user = await this.userModel.findOne({ googleId: profile.googleId });
    if (!user) {
      user = await this.userModel.create({
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
      });
    }

    const accessToken = this.jwtService.sign(
      { sub: user._id.toString(), role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: user._id.toString() },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );

    return { accessToken, refreshToken, user };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- auth.service.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 6: Create the DTO, controller, and module**

Create `backend/src/auth/dto/google-login.dto.ts`:
```typescript
import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(10)
  idToken: string;
}
```

Create `backend/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async google(@Body() dto: GoogleLoginDto) {
    const { accessToken, refreshToken, user } = await this.authService.loginWithGoogle(
      dto.idToken,
    );
    return {
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    };
  }
}
```

Create `backend/src/users/schemas` already exists (Task 2); add a minimal `backend/src/users/users.module.ts` so `User` model is registered once and shared:
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  exports: [MongooseModule],
})
export class UsersModule {}
```

Create `backend/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleVerifierService } from './google-verifier.service';

@Module({
  imports: [UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, GoogleVerifierService],
  exports: [AuthService],
})
export class AuthModule {}
```

Register `AuthModule` and `UsersModule` in `backend/src/app.module.ts`'s `imports: []` array (alongside `ConfigModule` and `MongooseModule` from Task 2).

- [ ] **Step 7: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: add Google OAuth login issuing JWT access and refresh tokens"
```

---

## Task 7: JWT auth guard + refresh endpoint

**Files:**
- Create: `backend/src/auth/jwt.strategy.ts`
- Create: `backend/src/common/guards/jwt-auth.guard.ts`
- Create: `backend/src/common/decorators/current-user.decorator.ts`
- Create: `backend/src/auth/dto/refresh.dto.ts`
- Modify: `backend/src/auth/auth.service.ts` (add `refresh` method)
- Modify: `backend/src/auth/auth.controller.ts` (add `POST /auth/refresh`)
- Modify: `backend/src/auth/auth.module.ts` (register `PassportModule`, `JwtStrategy`)
- Test: `backend/src/auth/auth.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (Task 1), `User` model (Task 2).
- Produces: `JwtAuthGuard` (used by every protected controller from Task 9 onward), `@CurrentUser()` decorator returning `{ userId: string; role: 'employee' | 'admin' }` from the validated JWT payload, `AuthService.refresh(refreshToken: string): Promise<{ accessToken: string }>`.

- [ ] **Step 1: Write the failing refresh test**

Append to `backend/src/auth/auth.service.spec.ts`, inside the existing `describe('AuthService', ...)` block:
```typescript
  it('issues a new access token from a valid refresh token', async () => {
    const jwtService = { sign: jest.fn().mockReturnValue('new-access-token'), verify: jest.fn() };
    // Rebuild service with a jwtService that supports verify()
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: GoogleVerifierService, useValue: googleVerifier },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                ALLOWED_GOOGLE_DOMAIN: 'example.com',
                JWT_ACCESS_SECRET: 'a'.repeat(32),
                JWT_REFRESH_SECRET: 'b'.repeat(32),
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();
    const refreshableService = moduleRef.get(AuthService);

    jwtService.verify.mockReturnValue({ sub: 'u1' });
    userModel.findOne.mockResolvedValue({ _id: 'u1', role: 'employee' });

    const result = await refreshableService.refresh('some-refresh-token');

    expect(jwtService.verify).toHaveBeenCalledWith('some-refresh-token', {
      secret: 'b'.repeat(32),
    });
    expect(result.accessToken).toBe('new-access-token');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- auth.service.spec.ts`
Expected: FAIL — `refreshableService.refresh is not a function`.

- [ ] **Step 3: Implement `refresh` on `AuthService`**

Add to `backend/src/auth/auth.service.ts`, inside the `AuthService` class:
```typescript
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    const user = await this.userModel.findOne({ _id: payload.sub });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    const accessToken = this.jwtService.sign(
      { sub: user._id.toString(), role: user.role },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
    return { accessToken };
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- auth.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Add the refresh DTO and controller route**

Create `backend/src/auth/dto/refresh.dto.ts`:
```typescript
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken: string;
}
```

Add to `backend/src/auth/auth.controller.ts`:
```typescript
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }
```
(with the corresponding `import { RefreshDto } from './dto/refresh.dto';` added at the top.)

- [ ] **Step 6: Implement the JWT strategy and guard**

Create `backend/src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  role: 'employee' | 'admin';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
```

Create `backend/src/common/guards/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Create `backend/src/common/decorators/current-user.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../auth/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 7: Register PassportModule and JwtStrategy in AuthModule**

Modify `backend/src/auth/auth.module.ts` — add `PassportModule` to `imports` and `JwtStrategy` to `providers`:
```typescript
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
// ...
@Module({
  imports: [UsersModule, JwtModule.register({}), PassportModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleVerifierService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 8: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat: add JWT refresh endpoint, JwtAuthGuard, and CurrentUser decorator"
```

---

## Task 8: Roles guard + admin bootstrap seed script

**Files:**
- Create: `backend/src/common/decorators/roles.decorator.ts`
- Create: `backend/src/common/guards/roles.guard.ts`
- Test: `backend/src/common/guards/roles.guard.spec.ts`
- Create: `backend/scripts/seed-admins.ts`
- Modify: `backend/package.json` (add `seed:admins` script)

**Interfaces:**
- Consumes: `JwtPayload` (Task 7, via `request.user.role`), `User` model (Task 2).
- Produces: `@Roles('admin')` decorator + `RolesGuard`, applied together with `JwtAuthGuard` on every admin-only route from Task 9 onward.

- [ ] **Step 1: Write the failing guard test**

Create `backend/src/common/guards/roles.guard.spec.ts`:
```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function mockContext(role: string | undefined, requiredRoles: string[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    getHandler: () => {},
    getClass: () => {},
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const { guard, context } = mockContext('employee', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user has a required role', () => {
    const { guard, context } = mockContext('admin', ['admin']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the user lacks a required role', () => {
    const { guard, context } = mockContext('employee', ['admin']);
    expect(guard.canActivate(context)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- roles.guard.spec.ts`
Expected: FAIL — cannot find module `./roles.guard`.

- [ ] **Step 3: Implement the decorator and guard**

Create `backend/src/common/decorators/roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

Create `backend/src/common/guards/roles.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- roles.guard.spec.ts`
Expected: PASS (all three tests)

- [ ] **Step 5: Write the admin bootstrap seed script**

Create `backend/scripts/seed-admins.ts`:
```typescript
import mongoose from 'mongoose';
import { User, UserSchema } from '../src/users/schemas/user.schema';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!mongoUri) throw new Error('MONGO_URI is required');
  if (adminEmails.length === 0) {
    console.log('No ADMIN_EMAILS configured, nothing to do.');
    return;
  }

  await mongoose.connect(mongoUri);
  const UserModel = mongoose.model(User.name, UserSchema);

  const result = await UserModel.updateMany(
    { email: { $in: adminEmails } },
    { $set: { role: 'admin' } },
  );
  console.log(`Promoted ${result.modifiedCount} user(s) to admin.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: this promotes existing users to admin — it only takes effect for users who have already signed in once via `POST /auth/google` (which creates their `User` document). Document this in the README (Task 16): run the seed script *after* the target admin has logged in at least once.

Add to `backend/package.json` `scripts`:
```json
"seed:admins": "ts-node scripts/seed-admins.ts"
```
(`ts-node` is already a transitive dev dependency of the Nest CLI scaffold; if `npm run seed:admins` fails with "ts-node not found", run `npm install -D ts-node`.)

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: add RolesGuard and admin bootstrap seed script"
```

---

## Task 9: Users module — list, me, update

**Files:**
- Modify: `backend/src/users/users.service.ts` (create — was only a placeholder module in Task 6)
- Create: `backend/src/users/users.controller.ts`
- Create: `backend/src/users/dto/update-user.dto.ts`
- Create: `backend/src/common/dto/pagination.dto.ts`
- Modify: `backend/src/users/users.module.ts` (add controller + service)
- Test: `backend/src/users/users.service.spec.ts`
- Test: `backend/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `User` model (Task 2), `JwtAuthGuard`/`RolesGuard`/`@Roles`/`@CurrentUser` (Tasks 7-8).
- Produces: `UsersService.findPaginated(page, limit)`, `UsersService.findById(id)`, `UsersService.update(id, dto)` — used by `attendance`/`location` modules (Tasks 11-15) to look up a user's `officeIds`.

- [ ] **Step 1: Write the failing pagination DTO + service test**

Create `backend/src/common/dto/pagination.dto.ts`:
```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
```

Create `backend/src/users/users.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';

describe('UsersService', () => {
  let service: UsersService;
  let model: any;

  beforeEach(async () => {
    model = {
      find: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ email: 'a@x.com' }]),
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: model }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('returns a paginated page of users with total count', async () => {
    const result = await service.findPaginated(1, 20);
    expect(result).toEqual({ items: [{ email: 'a@x.com' }], total: 1, page: 1, limit: 20 });
  });

  it('throws NotFoundException when updating a missing user', async () => {
    model.findByIdAndUpdate.mockResolvedValue(null);
    await expect(service.update('missing-id', { role: 'admin' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- users.service.spec.ts`
Expected: FAIL — cannot find module `./users.service`.

- [ ] **Step 3: Implement `UsersService`**

Create `backend/src/users/users.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async findPaginated(page: number, limit: number): Promise<PaginatedResult<UserDocument>> {
    const [items, total] = await Promise.all([
      this.userModel
        .find()
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(),
    ]);
    return { items, total, page, limit };
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const updated = await this.userModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return updated;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- users.service.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Add the update DTO and controller**

Create `backend/src/users/dto/update-user.dto.ts`:
```typescript
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsIn(['employee', 'admin'])
  role?: 'employee' | 'admin';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  officeIds?: string[];
}
```

Create `backend/src/users/users.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  list(@Query() pagination: PaginationDto) {
    return this.usersService.findPaginated(pagination.page, pagination.limit);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.usersService.findById(user.sub);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
```

Modify `backend/src/users/users.module.ts` to register the controller and service:
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [MongooseModule, UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: Write the failing e2e test for role-gated access**

Create `backend/test/users.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects GET /users for a non-admin employee token', () => {
    const token = jwtService.sign(
      { sub: '507f1f77bcf86cd799439011', role: 'employee' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
    return request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects GET /users with no token at all', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });
});
```

- [ ] **Step 7: Register the global ValidationPipe in `main.ts`**

Modify `backend/src/main.ts` to add, before `app.listen(...)`:
```typescript
import { ValidationPipe } from '@nestjs/common';
// ...
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

- [ ] **Step 8: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat: add users module with paginated list, me, and admin update"
```

---

## Task 10: Offices module — full CRUD

**Files:**
- Create: `backend/src/offices/offices.service.ts`
- Create: `backend/src/offices/offices.controller.ts`
- Create: `backend/src/offices/offices.module.ts`
- Create: `backend/src/offices/dto/create-office.dto.ts`
- Create: `backend/src/offices/dto/update-office.dto.ts`
- Test: `backend/src/offices/offices.service.spec.ts`

**Interfaces:**
- Consumes: `Office` model (Task 3), guards/decorators (Tasks 7-8), `PaginationDto` (Task 9).
- Produces: `OfficesService.create/findPaginated/update/remove` — used by `attendance.service.ts` (Task 11) to look up an office's `location`/`radiusMeters` for the geofence check.

- [ ] **Step 1: Write the failing service test**

Create `backend/src/offices/offices.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { OfficesService } from './offices.service';
import { Office } from './schemas/office.schema';

describe('OfficesService', () => {
  let service: OfficesService;
  let model: any;

  beforeEach(async () => {
    model = {
      create: jest.fn(),
      find: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
      countDocuments: jest.fn().mockResolvedValue(0),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [OfficesService, { provide: getModelToken(Office.name), useValue: model }],
    }).compile();
    service = moduleRef.get(OfficesService);
  });

  it('creates an office from lat/lng/radius input', async () => {
    model.create.mockResolvedValue({ name: 'HQ' });
    await service.create({ name: 'HQ', address: 'x', lat: 12.9, lng: 77.5, radiusMeters: 100 });
    expect(model.create).toHaveBeenCalledWith({
      name: 'HQ',
      address: 'x',
      location: { type: 'Point', coordinates: [77.5, 12.9] },
      radiusMeters: 100,
    });
  });

  it('throws NotFoundException when deleting a missing office', async () => {
    model.findByIdAndDelete.mockResolvedValue(null);
    await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- offices.service.spec.ts`
Expected: FAIL — cannot find module `./offices.service`.

- [ ] **Step 3: Implement the DTOs and service**

Create `backend/src/offices/dto/create-office.dto.ts`:
```typescript
import { IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateOfficeDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsNumber()
  @Min(10)
  @Max(2000)
  radiusMeters: number;
}
```

Create `backend/src/offices/dto/update-office.dto.ts`:
```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateOfficeDto } from './create-office.dto';

export class UpdateOfficeDto extends PartialType(CreateOfficeDto) {}
```

Run: `npm install @nestjs/mapped-types`

Create `backend/src/offices/offices.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Office, OfficeDocument } from './schemas/office.schema';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { PaginatedResult } from '../users/users.service';

@Injectable()
export class OfficesService {
  constructor(
    @InjectModel(Office.name) private readonly officeModel: Model<OfficeDocument>,
  ) {}

  create(dto: CreateOfficeDto): Promise<OfficeDocument> {
    return this.officeModel.create({
      name: dto.name,
      address: dto.address,
      location: { type: 'Point', coordinates: [dto.lng, dto.lat] },
      radiusMeters: dto.radiusMeters,
    });
  }

  async findPaginated(page: number, limit: number): Promise<PaginatedResult<OfficeDocument>> {
    const [items, total] = await Promise.all([
      this.officeModel.find().skip((page - 1) * limit).limit(limit).exec(),
      this.officeModel.countDocuments(),
    ]);
    return { items, total, page, limit };
  }

  async update(id: string, dto: UpdateOfficeDto): Promise<OfficeDocument> {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.lat !== undefined && dto.lng !== undefined) {
      patch.location = { type: 'Point', coordinates: [dto.lng, dto.lat] };
      delete patch.lat;
      delete patch.lng;
    }
    const updated = await this.officeModel.findByIdAndUpdate(id, patch, { new: true }).exec();
    if (!updated) throw new NotFoundException(`Office ${id} not found`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.officeModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException(`Office ${id} not found`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- offices.service.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Add the controller and module**

Create `backend/src/offices/offices.controller.ts`:
```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { OfficesService } from './offices.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';

@Controller('offices')
@UseGuards(JwtAuthGuard)
export class OfficesController {
  constructor(private readonly officesService: OfficesService) {}

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.officesService.findPaginated(pagination.page, pagination.limit);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateOfficeDto) {
    return this.officesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateOfficeDto) {
    return this.officesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.officesService.remove(id);
  }
}
```

Create `backend/src/offices/offices.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Office, OfficeSchema } from './schemas/office.schema';
import { OfficesService } from './offices.service';
import { OfficesController } from './offices.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Office.name, schema: OfficeSchema }])],
  controllers: [OfficesController],
  providers: [OfficesService],
  exports: [MongooseModule, OfficesService],
})
export class OfficesModule {}
```

Register `OfficesModule` in `backend/src/app.module.ts`'s `imports: []`.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: add offices module with admin-only CRUD"
```

---

## Task 11: Geofence distance util + clock-in

**Files:**
- Create: `backend/src/attendance/geo.util.ts`
- Test: `backend/src/attendance/geo.util.spec.ts`
- Create: `backend/src/attendance/attendance.service.ts`
- Test: `backend/src/attendance/attendance.service.spec.ts`
- Create: `backend/src/attendance/dto/clock-in.dto.ts`
- Create: `backend/src/attendance/attendance.controller.ts`
- Create: `backend/src/attendance/attendance.module.ts`

**Interfaces:**
- Consumes: `AttendanceRecord` model (Task 4), `OfficesService` (Task 10, to fetch office location/radius).
- Produces: `haversineDistanceMeters(a, b): number`, `AttendanceService.clockIn(userId, dto): Promise<AttendanceRecordDocument>` — throws `ConflictException` if already open, throws `BadRequestException` if outside geofence. `POST /attendance/clock-in`.

- [ ] **Step 1: Write the failing haversine test**

Create `backend/src/attendance/geo.util.spec.ts`:
```typescript
import { haversineDistanceMeters } from './geo.util';

describe('haversineDistanceMeters', () => {
  it('returns ~0 for the same point', () => {
    const d = haversineDistanceMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9716, lng: 77.5946 });
    expect(d).toBeLessThan(1);
  });

  it('returns roughly the correct distance for two known points', () => {
    // Roughly 111km apart (1 degree of latitude)
    const d = haversineDistanceMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 13.9716, lng: 77.5946 });
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- geo.util.spec.ts`
Expected: FAIL — cannot find module `./geo.util`.

- [ ] **Step 3: Implement the haversine util**

Create `backend/src/attendance/geo.util.ts`:
```typescript
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- geo.util.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Write the failing clock-in service test**

Create `backend/src/attendance/attendance.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceRecord } from './schemas/attendance-record.schema';
import { OfficesService } from '../offices/offices.service';

describe('AttendanceService.clockIn', () => {
  let service: AttendanceService;
  let model: any;
  let officesService: { findOne: jest.Mock };

  beforeEach(async () => {
    model = { findOne: jest.fn(), create: jest.fn() };
    officesService = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getModelToken(AttendanceRecord.name), useValue: model },
        { provide: OfficesService, useValue: officesService },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  it('rejects clock-in when the user already has an open record', async () => {
    model.findOne.mockResolvedValue({ _id: 'existing-open' });
    await expect(
      service.clockIn('u1', { officeId: 'o1', lat: 12.97, lng: 77.59 }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects clock-in when outside the office geofence', async () => {
    model.findOne.mockResolvedValue(null);
    officesService.findOne.mockResolvedValue({
      _id: 'o1',
      location: { coordinates: [77.5946, 12.9716] },
      radiusMeters: 100,
    });
    // ~11km away, well outside a 100m radius
    await expect(
      service.clockIn('u1', { officeId: 'o1', lat: 13.07, lng: 77.5946 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates an open record when inside the geofence', async () => {
    model.findOne.mockResolvedValue(null);
    officesService.findOne.mockResolvedValue({
      _id: 'o1',
      location: { coordinates: [77.5946, 12.9716] },
      radiusMeters: 200,
    });
    model.create.mockResolvedValue({ _id: 'r1', status: 'open' });

    const result = await service.clockIn('u1', { officeId: 'o1', lat: 12.9716, lng: 77.5946 });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', officeId: 'o1', status: 'open' }),
    );
    expect(result.status).toBe('open');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test -- attendance.service.spec.ts`
Expected: FAIL — cannot find module `./attendance.service`.

- [ ] **Step 7: Implement `AttendanceService.clockIn` (and the constructor/imports it needs)**

Create `backend/src/attendance/attendance.service.ts`:
```typescript
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AttendanceRecord, AttendanceRecordDocument } from './schemas/attendance-record.schema';
import { OfficesService } from '../offices/offices.service';
import { ClockInDto } from './dto/clock-in.dto';
import { haversineDistanceMeters } from './geo.util';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
    private readonly officesService: OfficesService,
  ) {}

  async clockIn(userId: string, dto: ClockInDto): Promise<AttendanceRecordDocument> {
    const openRecord = await this.attendanceModel.findOne({ userId, status: 'open' });
    if (openRecord) {
      throw new ConflictException('You already have an open attendance record');
    }

    const office = await this.officesService.findOne(dto.officeId);
    const [officeLng, officeLat] = office.location.coordinates;
    const distance = haversineDistanceMeters(
      { lat: dto.lat, lng: dto.lng },
      { lat: officeLat, lng: officeLng },
    );
    if (distance > office.radiusMeters) {
      throw new BadRequestException(
        `You are ${Math.round(distance)}m from the office, outside the ${office.radiusMeters}m radius`,
      );
    }

    return this.attendanceModel.create({
      userId,
      officeId: dto.officeId,
      clockIn: { time: new Date(), location: { lat: dto.lat, lng: dto.lng } },
      status: 'open',
    });
  }
}
```

- [ ] **Step 8: Add `OfficesService.findOne` (needed by the call above)**

Add to `backend/src/offices/offices.service.ts`, inside the `OfficesService` class:
```typescript
  async findOne(id: string): Promise<OfficeDocument> {
    const office = await this.officeModel.findById(id).exec();
    if (!office) throw new NotFoundException(`Office ${id} not found`);
    return office;
  }
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm run test -- attendance.service.spec.ts`
Expected: PASS (all three tests)

- [ ] **Step 10: Add the DTO, controller, and module**

Create `backend/src/attendance/dto/clock-in.dto.ts`:
```typescript
import { IsMongoId, IsNumber, Max, Min } from 'class-validator';

export class ClockInDto {
  @IsMongoId()
  officeId: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}
```

Create `backend/src/attendance/attendance.controller.ts`:
```typescript
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  clockIn(@CurrentUser() user: JwtPayload, @Body() dto: ClockInDto) {
    return this.attendanceService.clockIn(user.sub, dto);
  }
}
```

Create `backend/src/attendance/attendance.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttendanceRecord, AttendanceRecordSchema } from './schemas/attendance-record.schema';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { OfficesModule } from '../offices/offices.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
    ]),
    OfficesModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [MongooseModule, AttendanceService],
})
export class AttendanceModule {}
```

Register `AttendanceModule` in `backend/src/app.module.ts`'s `imports: []`.

- [ ] **Step 11: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add backend/
git commit -m "feat: add clock-in with haversine geofence check"
```

---

## Task 12: Clock-out + employee attendance history

**Files:**
- Modify: `backend/src/attendance/attendance.service.ts` (add `clockOut`, `findMine`)
- Modify: `backend/src/attendance/attendance.controller.ts` (add `POST /attendance/clock-out`, `GET /attendance/me`)
- Create: `backend/src/attendance/dto/clock-out.dto.ts`
- Modify: `backend/src/attendance/attendance.service.spec.ts` (extend)

**Interfaces:**
- Produces: `AttendanceService.clockOut(userId, dto): Promise<AttendanceRecordDocument>` — throws `NotFoundException` if no open record. `AttendanceService.findMine(userId, page, limit, from?, to?): Promise<PaginatedResult<AttendanceRecordDocument>>`.

- [ ] **Step 1: Write the failing clock-out test**

Append to `backend/src/attendance/attendance.service.spec.ts`, as a new `describe` block:
```typescript
describe('AttendanceService.clockOut', () => {
  let service: AttendanceService;
  let model: any;

  beforeEach(async () => {
    model = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getModelToken(AttendanceRecord.name), useValue: model },
        { provide: OfficesService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  it('throws NotFoundException when there is no open record', async () => {
    model.findOneAndUpdate.mockResolvedValue(null);
    await expect(service.clockOut('u1', { lat: 12.97, lng: 77.59 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('closes the open record with clock-out time and location', async () => {
    model.findOneAndUpdate.mockResolvedValue({ _id: 'r1', status: 'closed' });
    const result = await service.clockOut('u1', { lat: 12.97, lng: 77.59 });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'u1', status: 'open' },
      expect.objectContaining({
        status: 'closed',
        clockOut: expect.objectContaining({ location: { lat: 12.97, lng: 77.59 } }),
      }),
      { new: true },
    );
    expect(result.status).toBe('closed');
  });
});
```

Add `import { NotFoundException } from '@nestjs/common';` to the top of the spec file (alongside the existing `BadRequestException, ConflictException` import).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- attendance.service.spec.ts`
Expected: FAIL — `service.clockOut is not a function`.

- [ ] **Step 3: Implement `clockOut` and `findMine`**

Add to `backend/src/attendance/attendance.service.ts`, inside the `AttendanceService` class (and add `NotFoundException` to the existing `@nestjs/common` import):
```typescript
  async clockOut(userId: string, dto: ClockOutDto): Promise<AttendanceRecordDocument> {
    const updated = await this.attendanceModel.findOneAndUpdate(
      { userId, status: 'open' },
      {
        status: 'closed',
        clockOut: { time: new Date(), location: { lat: dto.lat, lng: dto.lng } },
      },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('No open attendance record to clock out of');
    }
    return updated;
  }

  async findMine(
    userId: string,
    page: number,
    limit: number,
    from?: Date,
    to?: Date,
  ): Promise<{ items: AttendanceRecordDocument[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { userId };
    if (from || to) {
      filter['clockIn.time'] = {
        ...(from && { $gte: from }),
        ...(to && { $lte: to }),
      };
    }
    const [items, total] = await Promise.all([
      this.attendanceModel
        .find(filter)
        .sort({ 'clockIn.time': -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.attendanceModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }
```

Add the import for `ClockOutDto` at the top: `import { ClockOutDto } from './dto/clock-out.dto';`

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- attendance.service.spec.ts`
Expected: PASS (all tests across both `describe` blocks)

- [ ] **Step 5: Add the DTO and controller routes**

Create `backend/src/attendance/dto/clock-out.dto.ts`:
```typescript
import { IsNumber, Max, Min } from 'class-validator';

export class ClockOutDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}
```

Add to `backend/src/attendance/attendance.controller.ts` (with `Get`, `Query` added to the `@nestjs/common` import, and `PaginationDto` imported from `'../common/dto/pagination.dto'`):
```typescript
  @Post('clock-out')
  clockOut(@CurrentUser() user: JwtPayload, @Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(user.sub, dto);
  }

  @Get('me')
  findMine(@CurrentUser() user: JwtPayload, @Query() pagination: PaginationDto) {
    return this.attendanceService.findMine(user.sub, pagination.page, pagination.limit);
  }
```

- [ ] **Step 6: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: add clock-out and paginated employee attendance history"
```

---

## Task 13: Admin attendance list + summary aggregation

**Files:**
- Modify: `backend/src/attendance/attendance.service.ts` (add `findAllAdmin`, `summary`)
- Modify: `backend/src/attendance/attendance.controller.ts` (add `GET /attendance`, `GET /attendance/summary`)
- Modify: `backend/src/attendance/attendance.service.spec.ts` (extend)

**Interfaces:**
- Produces: `AttendanceService.findAllAdmin(filters, page, limit)`, `AttendanceService.summary(from, to): Promise<{ userId: string; totalHours: number }[]>` — an aggregation pipeline, not an in-app loop over records.

- [ ] **Step 1: Write the failing summary aggregation test**

Append to `backend/src/attendance/attendance.service.spec.ts`:
```typescript
describe('AttendanceService.summary', () => {
  let service: AttendanceService;
  let model: any;

  beforeEach(async () => {
    model = { aggregate: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getModelToken(AttendanceRecord.name), useValue: model },
        { provide: OfficesService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  it('runs an aggregation pipeline and returns total hours per user', async () => {
    model.aggregate.mockResolvedValue([
      { userId: 'u1', totalHours: 37.5 },
      { userId: 'u2', totalHours: 40 },
    ]);

    const from = new Date('2026-09-01');
    const to = new Date('2026-09-07');
    const result = await service.summary(from, to);

    expect(model.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          status: 'closed',
          'clockIn.time': { $gte: from, $lte: to },
        },
      },
      {
        $project: {
          userId: 1,
          hours: {
            $divide: [{ $subtract: ['$clockOut.time', '$clockIn.time'] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalHours: { $sum: '$hours' },
        },
      },
      {
        $project: { _id: 0, userId: '$_id', totalHours: 1 },
      },
    ]);
    expect(result).toEqual([
      { userId: 'u1', totalHours: 37.5 },
      { userId: 'u2', totalHours: 40 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- attendance.service.spec.ts`
Expected: FAIL — `service.summary is not a function`.

- [ ] **Step 3: Implement `findAllAdmin` and `summary`**

Add to `backend/src/attendance/attendance.service.ts`, inside the `AttendanceService` class:
```typescript
  async findAllAdmin(
    filters: { userId?: string; officeId?: string; from?: Date; to?: Date },
    page: number,
    limit: number,
  ) {
    const filter: Record<string, unknown> = {};
    if (filters.userId) filter.userId = filters.userId;
    if (filters.officeId) filter.officeId = filters.officeId;
    if (filters.from || filters.to) {
      filter['clockIn.time'] = {
        ...(filters.from && { $gte: filters.from }),
        ...(filters.to && { $lte: filters.to }),
      };
    }
    const [items, total] = await Promise.all([
      this.attendanceModel
        .find(filter)
        .sort({ 'clockIn.time': -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.attendanceModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  summary(from: Date, to: Date): Promise<{ userId: string; totalHours: number }[]> {
    return this.attendanceModel.aggregate([
      {
        $match: {
          status: 'closed',
          'clockIn.time': { $gte: from, $lte: to },
        },
      },
      {
        $project: {
          userId: 1,
          hours: {
            $divide: [{ $subtract: ['$clockOut.time', '$clockIn.time'] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalHours: { $sum: '$hours' },
        },
      },
      {
        $project: { _id: 0, userId: '$_id', totalHours: 1 },
      },
    ]);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- attendance.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Add the admin controller routes**

Add to `backend/src/attendance/attendance.controller.ts` (add `RolesGuard`, `Roles` imports from Task 8):
```typescript
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
  findAll(
    @Query() pagination: PaginationDto,
    @Query('userId') userId?: string,
    @Query('officeId') officeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.findAllAdmin(
      { userId, officeId, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined },
      pagination.page,
      pagination.limit,
    );
  }

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles('admin')
  summary(@Query('from') from: string, @Query('to') to: string) {
    return this.attendanceService.summary(new Date(from), new Date(to));
  }
```

Note the route order: NestJS matches routes in registration order, and `@Get('summary')` must be declared so it doesn't collide with a param route — since there is no `@Get(':id')` on this controller, order doesn't matter here, but keep `summary` and the bare `@Get()` list separate as shown.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: add admin attendance list and hours-summary aggregation"
```

---

## Task 14: Location ping endpoint (open-attendance guarded + rate limited)

**Files:**
- Create: `backend/src/location/location.service.ts`
- Test: `backend/src/location/location.service.spec.ts`
- Create: `backend/src/location/dto/ping.dto.ts`
- Create: `backend/src/location/location.controller.ts`
- Create: `backend/src/location/location.module.ts`
- Modify: `backend/src/app.module.ts` (register global `ThrottlerModule`)
- Modify: `backend/src/auth/auth.controller.ts` (apply per-route throttle override to `/auth/google`)

**Interfaces:**
- Consumes: `LocationPing` model (Task 5), `AttendanceRecord` model (Task 4, to check for an open record — inject the model directly, not `AttendanceService`, to avoid a circular module dependency).
- Produces: `LocationService.recordPing(userId, dto): Promise<LocationPingDocument>` — throws `ConflictException` (409) if the user has no open attendance record.

- [ ] **Step 1: Write the failing service test**

Create `backend/src/location/location.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationPing } from './schemas/location-ping.schema';
import { AttendanceRecord } from '../attendance/schemas/attendance-record.schema';

describe('LocationService.recordPing', () => {
  let service: LocationService;
  let pingModel: any;
  let attendanceModel: any;

  beforeEach(async () => {
    pingModel = { create: jest.fn() };
    attendanceModel = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: getModelToken(LocationPing.name), useValue: pingModel },
        { provide: getModelToken(AttendanceRecord.name), useValue: attendanceModel },
      ],
    }).compile();
    service = moduleRef.get(LocationService);
  });

  it('rejects a ping when the user has no open attendance record', async () => {
    attendanceModel.findOne.mockResolvedValue(null);
    await expect(
      service.recordPing('u1', { lat: 12.97, lng: 77.59, timestamp: new Date().toISOString() }),
    ).rejects.toThrow(ConflictException);
    expect(pingModel.create).not.toHaveBeenCalled();
  });

  it('records a ping when the user is clocked in', async () => {
    attendanceModel.findOne.mockResolvedValue({ _id: 'r1' });
    pingModel.create.mockResolvedValue({ _id: 'p1' });

    await service.recordPing('u1', { lat: 12.97, lng: 77.59, timestamp: '2026-09-14T10:00:00.000Z' });

    expect(pingModel.create).toHaveBeenCalledWith({
      userId: 'u1',
      location: { type: 'Point', coordinates: [77.59, 12.97] },
      timestamp: new Date('2026-09-14T10:00:00.000Z'),
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- location.service.spec.ts`
Expected: FAIL — cannot find module `./location.service`.

- [ ] **Step 3: Implement `LocationService`**

Create `backend/src/location/location.service.ts`:
```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationPing, LocationPingDocument } from './schemas/location-ping.schema';
import { AttendanceRecord, AttendanceRecordDocument } from '../attendance/schemas/attendance-record.schema';
import { PingDto } from './dto/ping.dto';

@Injectable()
export class LocationService {
  constructor(
    @InjectModel(LocationPing.name)
    private readonly pingModel: Model<LocationPingDocument>,
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
  ) {}

  async recordPing(userId: string, dto: PingDto): Promise<LocationPingDocument> {
    const openRecord = await this.attendanceModel.findOne({ userId, status: 'open' });
    if (!openRecord) {
      throw new ConflictException('No open attendance record — clock in before sending location pings');
    }
    return this.pingModel.create({
      userId,
      location: { type: 'Point', coordinates: [dto.lng, dto.lat] },
      timestamp: new Date(dto.timestamp),
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- location.service.spec.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Add the DTO, controller, and module with rate limiting**

Create `backend/src/location/dto/ping.dto.ts`:
```typescript
import { IsISO8601, IsNumber, Max, Min } from 'class-validator';

export class PingDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsISO8601()
  timestamp: string;
}
```

Run: `npm install @nestjs/throttler` (if not already installed in Task 1's dependency list).

Create `backend/src/location/location.controller.ts`:
```typescript
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { LocationService } from './location.service';
import { PingDto } from './dto/ping.dto';

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('ping')
  @Throttle({ default: { limit: 1, ttl: 30000 } })
  ping(@CurrentUser() user: JwtPayload, @Body() dto: PingDto) {
    return this.locationService.recordPing(user.sub, dto);
  }
}
```

Create `backend/src/location/location.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationPing, LocationPingSchema } from './schemas/location-ping.schema';
import { AttendanceRecord, AttendanceRecordSchema } from '../attendance/schemas/attendance-record.schema';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationPing.name, schema: LocationPingSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
    ]),
  ],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [MongooseModule, LocationService],
})
export class LocationModule {}
```

- [ ] **Step 6: Register global ThrottlerModule and per-route override on `/auth/google`**

Modify `backend/src/app.module.ts` — add to `imports: []`:
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
// ...
ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
```
and to `providers: []` (create this array if it doesn't exist yet):
```typescript
providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
],
```

This makes 20 requests/min the default limit for every route. Add the spec's tighter override to `POST /auth/google` — modify `backend/src/auth/auth.controller.ts`:
```typescript
import { Throttle } from '@nestjs/throttler';
// ...
  @Post('google')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async google(@Body() dto: GoogleLoginDto) {
```

Register `LocationModule` in `backend/src/app.module.ts`'s `imports: []`.

- [ ] **Step 7: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: add location ping endpoint guarded by open-attendance check and rate limits"
```

---

## Task 15: Admin live map endpoint

**Files:**
- Modify: `backend/src/location/location.service.ts` (add `findLiveLocations`)
- Modify: `backend/src/location/location.controller.ts` (add `GET /location/live`)
- Modify: `backend/src/location/location.service.spec.ts` (extend)

**Interfaces:**
- Produces: `LocationService.findLiveLocations(): Promise<{ userId: string; lat: number; lng: number; timestamp: Date }[]>` — one row per user who currently has an open `AttendanceRecord`, with their single latest `LocationPing`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/location/location.service.spec.ts`:
```typescript
describe('LocationService.findLiveLocations', () => {
  let service: LocationService;
  let pingModel: any;
  let attendanceModel: any;

  beforeEach(async () => {
    pingModel = { aggregate: jest.fn() };
    attendanceModel = { distinct: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: getModelToken(LocationPing.name), useValue: pingModel },
        { provide: getModelToken(AttendanceRecord.name), useValue: attendanceModel },
      ],
    }).compile();
    service = moduleRef.get(LocationService);
  });

  it('returns the latest ping per currently clocked-in user', async () => {
    attendanceModel.distinct.mockResolvedValue(['u1', 'u2']);
    pingModel.aggregate.mockResolvedValue([
      { userId: 'u1', lat: 12.97, lng: 77.59, timestamp: new Date('2026-09-14T10:05:00Z') },
    ]);

    const result = await service.findLiveLocations();

    expect(attendanceModel.distinct).toHaveBeenCalledWith('userId', { status: 'open' });
    expect(pingModel.aggregate).toHaveBeenCalledWith([
      { $match: { userId: { $in: ['u1', 'u2'] } } },
      { $sort: { userId: 1, timestamp: -1 } },
      { $group: { _id: '$userId', doc: { $first: '$$ROOT' } } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          lat: { $arrayElemAt: ['$doc.location.coordinates', 1] },
          lng: { $arrayElemAt: ['$doc.location.coordinates', 0] },
          timestamp: '$doc.timestamp',
        },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u1');
  });

  it('returns an empty array when nobody is clocked in', async () => {
    attendanceModel.distinct.mockResolvedValue([]);
    const result = await service.findLiveLocations();
    expect(result).toEqual([]);
    expect(pingModel.aggregate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- location.service.spec.ts`
Expected: FAIL — `service.findLiveLocations is not a function`.

- [ ] **Step 3: Implement `findLiveLocations`**

Add to `backend/src/location/location.service.ts`, inside the `LocationService` class:
```typescript
  async findLiveLocations(): Promise<
    { userId: string; lat: number; lng: number; timestamp: Date }[]
  > {
    const clockedInUserIds = await this.attendanceModel.distinct('userId', { status: 'open' });
    if (clockedInUserIds.length === 0) {
      return [];
    }
    return this.pingModel.aggregate([
      { $match: { userId: { $in: clockedInUserIds } } },
      { $sort: { userId: 1, timestamp: -1 } },
      { $group: { _id: '$userId', doc: { $first: '$$ROOT' } } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          lat: { $arrayElemAt: ['$doc.location.coordinates', 1] },
          lng: { $arrayElemAt: ['$doc.location.coordinates', 0] },
          timestamp: '$doc.timestamp',
        },
      },
    ]);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- location.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Add the admin controller route**

Add to `backend/src/location/location.controller.ts` (add `Get`, `UseGuards` already imported; add `RolesGuard`, `Roles` imports):
```typescript
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
// ...
  @Get('live')
  @UseGuards(RolesGuard)
  @Roles('admin')
  live() {
    return this.locationService.findLiveLocations();
  }
```

- [ ] **Step 6: Run the full test suite**

Run: `npm run test && npm run test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: add admin live-location endpoint for the polling-based map"
```

---

## Task 16: README and local dev instructions

**Files:**
- Create: `backend/README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Write the README**

Create `backend/README.md`:
```markdown
# Employee Attendance Backend

NestJS + MongoDB API for the employee attendance & location tracking system.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in real values:
   - `MONGO_URI` — a running MongoDB instance (`docker run -d -p 27017:27017 mongo:7` for local dev)
   - `GOOGLE_CLIENT_ID` — OAuth 2.0 client ID from Google Cloud Console
   - `ALLOWED_GOOGLE_DOMAIN` — restrict sign-in to this email domain
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — any random 32+ character strings
   - `ADMIN_EMAILS` — comma-separated emails to promote to admin

## Running

- `npm run start:dev` — dev server with hot reload
- `npm run test` — unit tests
- `npm run test:e2e` — end-to-end tests (requires MongoDB reachable at `MONGO_URI`)

## Bootstrapping the first admin

1. Have the intended admin sign in once via the mobile app (or `POST /auth/google` directly) — this creates their `User` document with the default `employee` role.
2. Set `ADMIN_EMAILS` in `.env` to include their email.
3. Run `npm run seed:admins`.

## API summary

See `docs/superpowers/specs/2026-09-14-employee-attendance-system-design.md`
section 6 for the full endpoint list.
```

- [ ] **Step 2: Commit**

```bash
git add backend/README.md
git commit -m "docs: add backend README with setup and admin bootstrap instructions"
```

