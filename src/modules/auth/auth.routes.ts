import { Router, type Request, type Response } from 'express';
import nodeCrypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { signToken, isExpired } from './auth.middleware';
import userRepository from './user.repository';
import { asyncHandler } from '../../core/errors';
import categoryRepository from '../admin/category.repository';
import usersRoutes from './users.routes';
import { DEFAULT_SYSTEM_PROMPT } from '../../core/config';
import { USERNAME_MESSAGE } from '../../core/utils';
import AuditService from '../audit/audit.service';

const router = Router();
const { getGuestAllowedCategories } = usersRoutes;

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

const registerSchema = z.object({
  username: z.string()
    .min(8, 'Имя пользователя должно содержать не менее 8 символов')
    .max(64, 'Имя пользователя должно содержать не более 64 символов')
    .regex(/^[a-zA-Z0-9_-]+$/, USERNAME_MESSAGE),
  email: z.string().email('Некорректный формат email').max(128),
  password: z.string()
    .min(8, 'Пароль должен содержать не менее 8 символов')
    .regex(/[A-Z]/, 'Пароль должен содержать хотя бы одну заглавную букву')
    .regex(/[a-z]/, 'Пароль должен содержать хотя бы одну строчную букву')
    .regex(/[0-9]/, 'Пароль должен содержать хотя бы одну цифру')
    .regex(/[\W_]/, 'Пароль должен содержать хотя бы один специальный символ')
    .max(128),
  password_confirm: z.string().min(8).max(128),
  category: z.string().min(1).max(64).optional(),
}).refine((data) => data.password === data.password_confirm, {
  message: 'Пароли не совпадают',
  path: ['password_confirm'],
});

function clientIp(req: Request): string | null {
  return req.ip || req.socket.remoteAddress || null;
}

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const ip = clientIp(req);
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    AuditService.log(null, 'LOGIN_FAILED', { reason: 'invalid_format' }, ip);
    return res.status(400).json({ detail: 'Логин и пароль обязательны и должны быть корректного формата' });
  }
  const { username, password } = parseResult.data;

  const user = await userRepository.findByUsername(username);

  let isValid = false;
  if (user?.password_hash) {
    if (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')) {
      isValid = bcrypt.compareSync(password, user.password_hash);
    } else if (user.password_hash.length === 64) {
      const oldHash = nodeCrypto.createHash('sha256').update(password).digest('hex');
      if (oldHash === user.password_hash) {
        isValid = true;
        user.password_hash = await userRepository.hashPassword(password);
        await userRepository.save(username, user);
      }
    }
  }

  if (!isValid || !user) {
    AuditService.log(username, 'LOGIN_FAILED', { reason: 'invalid_credentials' }, ip);
    return res.status(401).json({ detail: 'Неверный логин или пароль' });
  }
  const authedUser = { ...user, username } as Parameters<typeof isExpired>[0];
  if (isExpired(authedUser)) {
    AuditService.log(username, 'LOGIN_FAILED', { reason: 'account_expired' }, ip);
    return res.status(403).json({ detail: 'Срок действия аккаунта истек' });
  }

  const token = signToken(authedUser);
  AuditService.log(username, 'LOGIN', null, ip);

  return res.json({
    access_token: token,
    token_type: 'bearer',
    must_change_password: !!user.must_change_password,
  });
}));

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const ip = clientIp(req);
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    AuditService.log(null, 'REGISTER_FAILED', { reason: 'invalid_format' }, ip);
    return res.status(400).json({ detail: 'Ошибка валидации', errors: parseResult.error.issues });
  }

  const { username, email, password, category } = parseResult.data;

  const existingUser = await userRepository.findByUsername(username);
  if (existingUser) {
    AuditService.log(username, 'REGISTER_FAILED', { reason: 'user_exists' }, ip);
    return res.status(409).json({ detail: 'Пользователь с таким именем уже существует' });
  }

  const existingEmailUser = await userRepository.findByEmail(email);
  if (existingEmailUser) {
    AuditService.log(existingEmailUser.username || null, 'REGISTER_FAILED', { reason: 'email_exists', attempted_username: username }, ip);
    return res.status(409).json({ detail: 'Пользователь с таким e-mail уже существует' });
  }

  const password_hash = await userRepository.hashPassword(password);
  const guestAllowedCategories = await getGuestAllowedCategories();
  let selectedCategory = category;
  if (selectedCategory) {
    const categoryExists = await categoryRepository.findByName(selectedCategory);
    if (!categoryExists || !guestAllowedCategories.includes(selectedCategory)) {
      AuditService.log(username, 'REGISTER_FAILED', { reason: 'category_not_found' }, ip);
      return res.status(400).json({ detail: 'Выбранная категория недоступна' });
    }
  } else {
    selectedCategory = guestAllowedCategories[0] || undefined;
  }
  const allowedCategories = guestAllowedCategories.length > 0
    ? guestAllowedCategories
    : (selectedCategory ? [selectedCategory] : []);

  const newUser = {
    password_hash,
    email,
    category: selectedCategory || null,
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    allowed_categories: allowedCategories,
    must_change_password: false,
    is_admin: false,
    is_blocked: false,
  };

  await userRepository.save(username, newUser);
  AuditService.log(username, 'REGISTER', null, ip);

  return res.status(201).json({ detail: 'Пользователь успешно зарегистрирован' });
}));

export = router;
