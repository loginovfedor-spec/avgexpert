import { Router } from 'express';
import { authenticate, requireAdmin } from '../auth/auth.middleware';
import usersRouter from './admin.users.routes';
import categoriesRouter from './admin.categories.routes';
import statsRouter from './admin.stats.routes';
import providersRouter from './admin.providers.routes';
import { pushDebugLog } from './debug-log.store';

const router = Router();

router.use(authenticate, requireAdmin);
router.use('/users', usersRouter);
router.use('/categories', categoriesRouter);
router.use('/providers', providersRouter);
router.use('/', statsRouter);

type AdminRouter = typeof router & {
  pushDebugLog: typeof pushDebugLog;
};

export = Object.assign(router, { pushDebugLog }) as AdminRouter;
