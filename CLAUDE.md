# Neon Goals Service - Development Guide

## Overview

NestJS backend service for the Neon Goals application. Provides REST APIs for user authentication, goal management, and AI chat features.

## Authentication

### Supported Methods

1. **GitHub OAuth** - Production authentication method
2. **Email/Password** - Additional authentication (requires email verification)
3. **Demo Mode** - Local-only development (no backend call)

### Email/Password Flow

1. User registers → verification token generated
2. User receives email with verification link (TODO: Mailgun integration)
3. User verifies email → can now login
4. Login returns JWT token (7-day expiration)

### Test User

For development and testing, a pre-verified test user is created via seed script:

| Credential | Value |
|------------|-------|
| Email | `test@example.com` |
| Password | `Test@1234` |
| Name | `Test User` |

**Note**: Credentials are stored in `.env` as `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_NAME`. Change these values if the defaults don't work for your environment.

### Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (!@#$%^&* etc.)

### Email Verification (Development Mode)

In development mode, the verification token is returned in the registration response for manual testing. This allows testing the flow without setting up an email service.

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user (returns verification token) |
| POST | `/auth/verify-email` | Verify email with token |
| POST | `/auth/resend-verification` | Resend verification email |
| POST | `/auth/login` | Login with email/password |
| GET | `/auth/github` | Initiate GitHub OAuth |
| GET | `/auth/github/callback` | GitHub OAuth callback |
| POST | `/auth/demo` | Create demo user |
| GET | `/auth/me` | Get current user profile |
| POST | `/auth/logout` | Logout |

### Rate Limiting

All auth endpoints have rate limiting via NestJS Throttler:
- Register/Login: 5 requests per 15 minutes
- Email verification: 10 requests per hour
- Resend verification: 3 requests per hour
- Password reset: 3 requests per hour

## TODO: Mailgun Integration

Email verification currently returns the token in development mode. For production:

1. Add Mailgun SDK: `npm install mailgun.js`
2. Add environment variables:
   - `MAILGUN_API_KEY`
   - `MAILGUN_DOMAIN`
   - `MAILGUN_FROM_EMAIL`
3. Update `auth.service.ts` to send actual emails
4. Create email templates for verification and password reset

## Database

### Schema

The application uses PostgreSQL with Prisma ORM.

Key fields for email/password authentication:
- `passwordHash` - Bcrypt hashed password (10 salt rounds)
- `emailVerified` - Timestamp when email was verified
- `resetPasswordToken` - Used for both password reset and email verification
- `resetPasswordExpires` - Token expiration (24 hours)

### Seed Script

Run the seed script to populate initial data:

```bash
npm run prisma:seed
```

This creates:
- Casey Key user with sample goals
- Test user with email/password authentication

## Security Considerations

1. **Password hashing** - bcrypt with 10 salt rounds
2. **JWT expiration** - 7 days
3. **HTTPS only** - Never send credentials in URL params
4. **Rate limiting** - Prevents brute force attacks
5. **Email enumeration protection** - Always return success on resend
6. **Input validation** - Both frontend and backend
7. **Environment variables** - Never commit credentials to Git

## Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your values

4. Run database migrations:
   ```bash
   npm run prisma:migrate dev
   ```

5. Seed the database:
   ```bash
   npm run prisma:seed
   ```

6. Start the development server:
   ```bash
   npm run start:dev
   ```

The API will be available at `http://localhost:3001`

### Testing

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Run with coverage
npm run test:cov
```

### Useful Commands

```bash
# Generate Prisma client
npm run prisma:generate

# Open Prisma Studio (DB GUI)
npm run prisma:studio

# Format code
npm run format

# Lint code
npm run lint
```

## Project Structure

```
src/
├── common/           # Shared utilities (guards, decorators, etc.)
├── modules/          # Feature modules
│   ├── auth/        # Authentication module
│   ├── goals/       # Goals module
│   └── chat/        # AI chat module
└── main.ts          # Application entry point
```

## Frontend

The frontend is located at `/home/trill/Development/neon-goals-ui` and runs on port 8081 by default.
