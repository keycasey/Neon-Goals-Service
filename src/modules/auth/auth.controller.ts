import { Controller, Get, Post, Body, UseGuards, Req, Res, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GitHubAuthGuard } from './strategies/github-auth.guard';
import { LocalAuthGuard } from './strategies/local-auth.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Get('github')
  @UseGuards(GitHubAuthGuard)
  async githubLogin() {
    // GitHub auth is handled by Passport
  }

  @Get('github/callback')
  @UseGuards(GitHubAuthGuard)
  async githubCallback(@Req() req, @Res() res: Response) {
    const { access_token, user } = await this.authService.validateGitHubUser(
      req.user.githubId,
      req.user.profile,
    );

    // Redirect to frontend with token
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?token=${access_token}`,
    );
  }

  @Post('demo')
  async demoLogin() {
    // Create or get demo user and return JWT token
    const { access_token, user } = await this.authService.createDemoUser();
    return {
      access_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {
    const user = await this.authService.validateUser(req.user.userId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      githubLogin: user.githubLogin,
      settings: user.settings,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout() {
    // Client-side will handle token removal
    return { message: 'Logged out successfully' };
  }

  // ============ Email/Password Authentication Routes ============

  /**
   * Register a new user with email and password
   * Rate limited: 5 requests per 15 minutes
   * Returns verification info - user must verify email before logging in
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 requests per 15 minutes
  async register(
    @Body() body: { email: string; password: string; name: string }
  ) {
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return { message: 'Email, password, and name are required' };
    }

    const result = await this.authService.register(email, password, name);
    return result;
  }

  /**
   * Verify email with token
   * Rate limited: 10 requests per hour
   */
  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 requests per hour
  async verifyEmail(@Body() body: { token: string }) {
    const result = await this.authService.verifyEmail(body.token);
    return {
      access_token: result.access_token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        avatar: result.user.avatar,
      },
    };
  }

  /**
   * Resend verification email
   * Rate limited: 3 requests per hour
   */
  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
  async resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  /**
   * Login with email and password
   * Rate limited: 5 requests per 15 minutes
   */
  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 requests per 15 minutes
  async loginWithEmail(@Req() req) {
    const origin = req.headers.origin || req.headers.referer || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    this.logger.log(`
=== LOGIN REQUEST ===
Email: ${req.user.email}
Origin: ${origin}
User-Agent: ${userAgent}
IP: ${req.ip}
Headers: ${JSON.stringify({
      origin: req.headers.origin,
      referer: req.headers.referer,
      host: req.headers.host,
      'content-type': req.headers['content-type'],
    }, null, 2)}
======================
    `);

    const { access_token, user } = await this.authService.generateToken(req.user);

    this.logger.log(`✅ Login successful for ${user.email} from ${origin}`);

    return {
      access_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    };
  }

  /**
   * Initiate password reset
   * Rate limited: 3 requests per hour
   */
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  /**
   * Complete password reset
   * Rate limited: 3 requests per hour
   */
  @Post('reset-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }
}
