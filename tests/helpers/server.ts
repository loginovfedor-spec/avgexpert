import type { Application } from 'express';
import type { Server } from 'http';
import srv from '../../server';

export const app: Application = srv.app;
export const server: Server | undefined = srv.server ?? undefined;
