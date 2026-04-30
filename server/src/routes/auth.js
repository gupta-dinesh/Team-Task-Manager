import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { prisma } from '../prisma.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidation } from '../utils/validation.js';

const router = Router();

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email
});

router.post(
  '/signup',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    handleValidation
  ],
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash }
    });

    res.status(201).json({ user: publicUser(user), token: signToken(user.id) });
  })
);

router.post(
  '/login',
  [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidation
  ],
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({ user: publicUser(user), token: signToken(user.id) });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
