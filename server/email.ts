import urBackend from '@urbackend/sdk';
import pino from 'pino';
import { env } from './config/env.js';

const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });
const client = urBackend({ apiKey: env.URBACKEND_SECRET_KEY });

export class EmailDeliveryError extends Error {
  constructor(message = 'Email delivery failed.') {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

type AuthPurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

const template = (purpose: AuthPurpose, code: string) => {
  const title = purpose === 'EMAIL_VERIFY' ? 'Verify your InstRent email' : 'Reset your InstRent password';
  return {
    subject: title,
    text: `${title}\n\nYour six-digit code is ${code}.\nIt expires in 10 minutes.\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#18181b"><h1 style="color:#e11d48">InstRent</h1><h2>${title}</h2><p>Your six-digit code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes.</p><p style="color:#71717a">If you did not request this, you can safely ignore this email.</p></div>`,
  };
};

export const sendAuthEmail = async (to: string, purpose: AuthPurpose, code: string) => {
  if (!client) throw new EmailDeliveryError('Email delivery is not configured.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new EmailDeliveryError('Invalid email address.');
  try {
    const result = await client.mail.send({ to, ...template(purpose, code) });
    logger.info({ purpose, provider: result.provider }, 'Authentication email accepted by mail provider');
  } catch (error) {
    logger.error({ purpose, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Authentication email delivery failed');
    throw new EmailDeliveryError();
  }
};
