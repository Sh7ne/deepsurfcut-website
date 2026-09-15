import { createRetentionHandler } from '../../../server/retention.js';

export const onRequest = createRetentionHandler('Sandbox');
