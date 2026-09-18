import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import type { Bindings } from './env';
import { isLocal } from './env';

export function createAuth(env: Bindings) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('Authentication secret is not configured');
  return betterAuth({
    database: env.DB,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {},
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    user: { deleteUser: { enabled: false } },
    plugins: [magicLink({
      expiresIn: 600,
      storeToken: 'hashed',
      sendMagicLink: async ({ email, url }) => {
        if (isLocal(env, env.APP_URL)) {
          await env.DB.prepare('INSERT INTO local_mail(id,email,url) VALUES(?,?,?)').bind(crypto.randomUUID(),email,url).run();
          return;
        }
        if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('Email sign-in is not configured');
        const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_FROM, to: email, subject: 'Your glutenfree.mt sign-in link', text: `Sign in to glutenfree.mt:\n\n${url}\n\nThis link expires in 10 minutes. If you did not request it, ignore this email.` }) });
        if (!response.ok) throw new Error('Unable to send sign-in email');
      },
    })],
  });
}
