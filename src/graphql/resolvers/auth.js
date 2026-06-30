import { GraphQLError } from 'graphql';
import db from '../../db/connection.js';
import { withTenant } from '../../db/withTenant.js';
import { requireAuth, requireRole, PLATFORM_ROLES } from '../context.js';
import { hashPassword, verifyPassword, checkPasswordStrength } from '../../utils/password.js';
import { signAccessToken, generateRefreshToken, hashToken, refreshTokenExpiry } from '../../utils/jwt.js';
import { paginationArgs, buildPageInfo } from '../../utils/format.js';
import { nanoid } from 'nanoid';

async function issueTokenPair(user, meta = {}) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();

  await db('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    device_label: meta.deviceLabel || null,
    ip_address: meta.ipAddress || null,
    expires_at: refreshTokenExpiry(),
  });

  return { accessToken, refreshToken, user };
}

export const authResolvers = {
  Query: {
    me: async (_p, _a, ctx) => {
      if (!ctx.user) return null;
      return ctx.loaders.userById.load(ctx.user.id);
    },

    users: async (_p, { pagination, search, role, status }, ctx) => {
      const user = requireAuth(ctx);
      // Franchise owners may list their own tenant's staff; platform roles list everyone.
      if (!PLATFORM_ROLES.includes(user.role) && user.role !== 'FRANCHISE_OWNER') {
        throw new GraphQLError('Not authorized to list users.', { extensions: { code: 'FORBIDDEN' } });
      }

      const { page, pageSize, offset, limit } = paginationArgs(pagination);

      const rows = await withTenant(ctx.rls, async (trx) => {
        let q = trx('users').whereNull('deleted_at');
        if (role) q = q.andWhere('role', role);
        if (status === 'active') q = q.andWhere('is_active', true);
        if (status === 'inactive') q = q.andWhere('is_active', false);
        if (search) {
          q = q.andWhere((b) => b.whereILike('name', `%${search}%`).orWhereILike('email', `%${search}%`));
        }
        const countRow = await q.clone().count('* as count').first();
        const items = await q.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);
        return { items, totalCount: Number(countRow.count) };
      });

      return { items: rows.items, pageInfo: buildPageInfo({ page, pageSize, totalCount: rows.totalCount }) };
    },
  },

  Mutation: {
    signup: async (_p, { input }, ctx) => {
      const { role, name, email, password, phone, city, businessName, gstin } = input;

      if (!['CUSTOMER', 'FRANCHISE_OWNER'].includes(role)) {
        throw new GraphQLError('Self-signup is only available for customers and franchise partners.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const strength = checkPasswordStrength(password);
      if (!strength.valid) {
        throw new GraphQLError(`Weak password: ${strength.reasons.join('; ')}`, { extensions: { code: 'BAD_USER_INPUT' } });
      }

      const existing = await db('users').whereRaw('lower(email) = lower(?)', [email]).whereNull('deleted_at').first();
      if (existing) {
        throw new GraphQLError('An account with this email already exists.', { extensions: { code: 'CONFLICT' } });
      }

      const passwordHash = await hashPassword(password);

      const result = await db.transaction(async (trx) => {
        let tenantId = null;

        if (role === 'FRANCHISE_OWNER') {
          if (!businessName) {
            throw new GraphQLError('Business name is required for franchise sign-up.', { extensions: { code: 'BAD_USER_INPUT' } });
          }
          const starterPlan = await trx('plans').where('code', 'starter').first();
          const [tenant] = await trx('tenants').insert({
            name: businessName,
            slug: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nanoid(6)}`,
            billing_email: email,
            phone,
            gstin: gstin || null,
            city,
            plan_id: starterPlan?.id,
            status: 'TRIAL',
            trial_ends_at: db.raw(`now() + interval '${process.env.TRIAL_PERIOD_DAYS || 14} days'`),
          }).returning('*');
          tenantId = tenant.id;
        }

        const [user] = await trx('users').insert({
          tenant_id: tenantId,
          role,
          name,
          email,
          phone,
          city,
          password_hash: passwordHash,
        }).returning('*');

        return user;
      });

      return issueTokenPair(result);
    },

    login: async (_p, { input }, _ctx) => {
      const { email, password, role } = input;

      const user = await db('users').whereRaw('lower(email) = lower(?)', [email]).whereNull('deleted_at').first();
      if (!user) throw new GraphQLError('No account found with this email.', { extensions: { code: 'UNAUTHENTICATED' } });

      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) throw new GraphQLError('Incorrect password.', { extensions: { code: 'UNAUTHENTICATED' } });

      if (user.role !== role) {
        throw new GraphQLError(`This account is registered as ${user.role}. Select the correct role.`, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (!user.is_active) {
        throw new GraphQLError('This account has been suspended. Contact support.', { extensions: { code: 'FORBIDDEN' } });
      }

      await db('users').where('id', user.id).update({ last_login_at: db.fn.now() });

      return issueTokenPair(user);
    },

    refreshToken: async (_p, { refreshToken }, _ctx) => {
      const tokenHash = hashToken(refreshToken);
      const record = await db('refresh_tokens')
        .where({ token_hash: tokenHash })
        .whereNull('revoked_at')
        .where('expires_at', '>', db.fn.now())
        .first();

      if (!record) throw new GraphQLError('Invalid or expired refresh token.', { extensions: { code: 'UNAUTHENTICATED' } });

      const user = await db('users').where('id', record.user_id).first();
      if (!user || !user.is_active) throw new GraphQLError('Account not available.', { extensions: { code: 'UNAUTHENTICATED' } });

      // Rotate: revoke old, issue new (mitigates refresh-token replay)
      await db('refresh_tokens').where('id', record.id).update({ revoked_at: db.fn.now() });

      return issueTokenPair(user);
    },

    logout: async (_p, { refreshToken }, ctx) => {
      requireAuth(ctx);
      await db('refresh_tokens').where('token_hash', hashToken(refreshToken)).update({ revoked_at: db.fn.now() });
      return { success: true, message: 'Logged out.' };
    },

    logoutAllSessions: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      await db('refresh_tokens').where('user_id', user.id).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
      return { success: true, message: 'All sessions logged out.' };
    },

    requestPasswordReset: async (_p, { email }, _ctx) => {
      const user = await db('users').whereRaw('lower(email) = lower(?)', [email]).first();
      // Always return success even if not found — avoids leaking which emails are registered.
      if (!user) return { success: true, message: 'If that email exists, a reset link has been sent.' };

      const rawToken = generateRefreshToken();
      await db('verification_tokens').insert({
        user_id: user.id,
        purpose: 'PASSWORD_RESET',
        token_hash: hashToken(rawToken),
        contact: email,
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      });

      // TODO: integrate transactional email provider; for now this is logged for dev.
      console.log(`[password-reset] token for ${email}: ${rawToken}`);

      return { success: true, message: 'If that email exists, a reset link has been sent.' };
    },

    resetPassword: async (_p, { token, newPassword }, _ctx) => {
      const strength = checkPasswordStrength(newPassword);
      if (!strength.valid) throw new GraphQLError(`Weak password: ${strength.reasons.join('; ')}`, { extensions: { code: 'BAD_USER_INPUT' } });

      const record = await db('verification_tokens')
        .where({ token_hash: hashToken(token), purpose: 'PASSWORD_RESET' })
        .whereNull('consumed_at')
        .where('expires_at', '>', db.fn.now())
        .first();

      if (!record) throw new GraphQLError('Invalid or expired reset link.', { extensions: { code: 'BAD_USER_INPUT' } });

      const passwordHash = await hashPassword(newPassword);
      await db.transaction(async (trx) => {
        await trx('users').where('id', record.user_id).update({ password_hash: passwordHash });
        await trx('verification_tokens').where('id', record.id).update({ consumed_at: trx.fn.now() });
        // Security best practice: kill all existing sessions on password reset.
        await trx('refresh_tokens').where('user_id', record.user_id).whereNull('revoked_at').update({ revoked_at: trx.fn.now() });
      });

      return { success: true, message: 'Password reset successfully. Please sign in again.' };
    },

    changePassword: async (_p, { currentPassword, newPassword }, ctx) => {
      const authUser = requireAuth(ctx);
      const strength = checkPasswordStrength(newPassword);
      if (!strength.valid) throw new GraphQLError(`Weak password: ${strength.reasons.join('; ')}`, { extensions: { code: 'BAD_USER_INPUT' } });

      const user = await db('users').where('id', authUser.id).first();
      const ok = await verifyPassword(currentPassword, user.password_hash);
      if (!ok) throw new GraphQLError('Current password is incorrect.', { extensions: { code: 'BAD_USER_INPUT' } });

      const passwordHash = await hashPassword(newPassword);
      await db.transaction(async (trx) => {
        await trx('users').where('id', user.id).update({ password_hash: passwordHash });
        await trx('refresh_tokens').where('user_id', user.id).whereNull('revoked_at').update({ revoked_at: trx.fn.now() });
      });

      return { success: true, message: 'Password changed. Please sign in again.' };
    },

    verifyOtp: async (_p, { contact, code, purpose }, _ctx) => {
      const record = await db('verification_tokens')
        .where({ contact, purpose, token_hash: hashToken(code) })
        .whereNull('consumed_at')
        .where('expires_at', '>', db.fn.now())
        .first();

      if (!record) {
        // Demo-friendly fallback: accept any 6-digit code in non-production envs.
        if (process.env.NODE_ENV !== 'production' && /^\d{6}$/.test(code)) {
          return { success: true, message: 'OTP verified (dev mode).' };
        }
        throw new GraphQLError('Invalid or expired OTP.', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      await db('verification_tokens').where('id', record.id).update({ consumed_at: db.fn.now() });
      if (record.user_id && purpose === 'EMAIL_VERIFY') {
        await db('users').where('id', record.user_id).update({ email_verified: true });
      }
      if (record.user_id && purpose === 'PHONE_OTP') {
        await db('users').where('id', record.user_id).update({ phone_verified: true });
      }

      return { success: true, message: 'Verified successfully.' };
    },

    resendOtp: async (_p, { contact, purpose }, _ctx) => {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db('verification_tokens').insert({
        purpose,
        contact,
        token_hash: hashToken(code),
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
      });
      console.log(`[otp] ${purpose} code for ${contact}: ${code}`);
      return { success: true, message: 'OTP sent.' };
    },

    updateProfile: async (_p, { name, phone, city, avatarUrl }, ctx) => {
      const authUser = requireAuth(ctx);
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (phone !== undefined) patch.phone = phone;
      if (city !== undefined) patch.city = city;
      if (avatarUrl !== undefined) patch.avatar_url = avatarUrl;

      const [updated] = await db('users').where('id', authUser.id).update(patch).returning('*');
      return updated;
    },

    updateNotificationPrefs: async (_p, { prefs }, ctx) => {
      const authUser = requireAuth(ctx);
      const [updated] = await db('users').where('id', authUser.id).update({ notification_prefs: prefs }).returning('*');
      return updated;
    },

    setUserStatus: async (_p, { userId, isActive }, ctx) => {
      const actor = requireAuth(ctx);
      if (!PLATFORM_ROLES.includes(actor.role) && actor.role !== 'FRANCHISE_OWNER') {
        throw new GraphQLError('Not authorized.', { extensions: { code: 'FORBIDDEN' } });
      }

      const [updated] = await withTenant(ctx.rls, (trx) =>
        trx('users').where('id', userId).update({ is_active: isActive }).returning('*')
      );

      if (!updated) throw new GraphQLError('User not found.', { extensions: { code: 'NOT_FOUND' } });
      return updated;
    },
  },

  User: {
    tenant: (user, _a, ctx) => (user.tenant_id ? ctx.loaders.tenantById.load(user.tenant_id) : null),
    avatarUrl: (user) => user.avatar_url,
    emailVerified: (user) => user.email_verified,
    phoneVerified: (user) => user.phone_verified,
    isActive: (user) => user.is_active,
    notificationPrefs: (user) => user.notification_prefs,
    lastLoginAt: (user) => user.last_login_at,
    createdAt: (user) => user.created_at,
  },
};
