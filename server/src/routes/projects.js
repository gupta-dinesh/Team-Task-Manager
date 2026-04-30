import { Router } from 'express';
import { body, param } from 'express-validator';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { loadMembership, requireAdmin } from '../middleware/projectAccess.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidation } from '../utils/validation.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const memberships = await prisma.projectMembership.findMany({
      where: { userId: req.user.id },
      include: {
        project: {
          include: {
            memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
            tasks: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      projects: memberships.map(({ project, role }) => ({
        ...project,
        role,
        progress: project.tasks.length
          ? Math.round((project.tasks.filter((task) => task.status === 'DONE').length / project.tasks.length) * 100)
          : 0
      }))
    });
  })
);

router.post(
  '/',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Project name must be at least 2 characters'),
    body('description').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('Description is too long'),
    handleValidation
  ],
  asyncHandler(async (req, res) => {
    const project = await prisma.project.create({
      data: {
        name: req.body.name,
        description: req.body.description,
        memberships: {
          create: {
            userId: req.user.id,
            role: 'ADMIN'
          }
        }
      },
      include: { memberships: true, tasks: true }
    });

    res.status(201).json({ project: { ...project, role: 'ADMIN', progress: 0 } });
  })
);

router.get(
  '/:projectId',
  [param('projectId').isString(), handleValidation],
  loadMembership,
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.projectId },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' }
        },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            creator: { select: { id: true, name: true, email: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    res.json({ project: { ...project, role: req.membership.role } });
  })
);

router.post(
  '/:projectId/members',
  [
    param('projectId').isString(),
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('role').optional().isIn(['ADMIN', 'MEMBER']).withMessage('Role must be ADMIN or MEMBER'),
    handleValidation
  ],
  loadMembership,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });

    if (!user) {
      return res.status(404).json({ message: 'No user found for that email' });
    }

    const membership = await prisma.projectMembership.upsert({
      where: { userId_projectId: { userId: user.id, projectId: req.projectId } },
      update: { role: req.body.role || 'MEMBER' },
      create: { userId: user.id, projectId: req.projectId, role: req.body.role || 'MEMBER' },
      include: { user: { select: { id: true, name: true, email: true } } }
    });

    res.status(201).json({ membership });
  })
);

router.patch(
  '/:projectId/members/:memberId',
  [
    param('projectId').isString(),
    param('memberId').isString(),
    body('role').isIn(['ADMIN', 'MEMBER']).withMessage('Role must be ADMIN or MEMBER'),
    handleValidation
  ],
  loadMembership,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await prisma.projectMembership.findFirst({
      where: { id: req.params.memberId, projectId: req.projectId }
    });

    if (!target) {
      return res.status(404).json({ message: 'Project member not found' });
    }

    const membership = await prisma.projectMembership.update({
      where: { id: target.id },
      data: { role: req.body.role },
      include: { user: { select: { id: true, name: true, email: true } } }
    });

    res.json({ membership });
  })
);

export default router;
