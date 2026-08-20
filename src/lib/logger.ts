import pino from 'pino';
import { config } from '../config.js';

// Structured JSON logs in every environment: simpler dependency footprint than
// wiring pino-pretty for dev, and JSON is what a real log aggregator wants anyway.
export const logger = pino({
  level: config.logLevel,
});
