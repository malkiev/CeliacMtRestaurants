import type { Member } from '../shared/types';
export type Bindings = { DB: D1Database; PHOTOS: R2Bucket; ASSETS: Fetcher; ENVIRONMENT: string; APP_URL: string; BETTER_AUTH_SECRET: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; MAP_STYLE_URL?: string };
export type AppEnv = { Bindings: Bindings; Variables: { member: Member } };
export function isLocal(env: Bindings, url: string) { return env.ENVIRONMENT === 'development' && ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname); }
