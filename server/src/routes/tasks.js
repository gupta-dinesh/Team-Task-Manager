import { Router } from 'express';
import { body, param } from 'express-validator';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { loadMembership, requireAdmin } from '../middleware/projectAccess.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleValidation } from '../utils/validation.js';

const router = Router();

router.use(requireAuth);

const taskValidation = [
  body('title').trim().isLength({ min: 2 }).withMessage('Task title must be at least 2 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Description is too long'),
  body('status').optional().isIn(['TODO', 'IN_PROGRESS', 'DONE']).withMessage('Invalid status'),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid priority'),
  body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Due date must be a valid date'),
  body('assigneeId').optional({ nullable: true }).isString().withMessage('Invalid assignee')
];

const ensureAssigneeInProject = async (projectId, assigneeId) => {
  if (!assigneeId) return true;

  const membership = await prisma.projectMembership.findUnique({
    where: { userId_projectId: { userId: assigneeId, projectId } }
  });

  return Boolean(membership);
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const memberships = await prisma.projectMembership.findMany({
      where: { userId: req.user.id },
      select: { projectId: true }
    });
    const projectIds = memberships.map((membership) => membership.projectId);
    const today = new Date();

    const tasks = await prisma.task.findMany({
      where: { projectId: { in: projectIds } },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } }
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }]
    });

    const mine = tasks.filter((task) => task.assigneeId === req.user.id);

    res.json({
      tasks,
      dashboard: {
        total: tasks.length,
        mine: mine.length,
        todo: tasks.filter((task) => task.status === 'TODO').length,
        inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
        done: tasks.filter((task) => task.status === 'DONE').length,
        overdue: tasks.filter((task) => task.dueDate && task.status !== 'DONE' && new Date(task.dueDate) < today).length
      }
    });
  })
);

router.post(
  '/',
  [
    body('projectId').isString().withMessage('Project is required'),
    ...taskValidation,
    handleValidation
  ],
  loadMembership,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!(await ensureAssigneeInProject(req.projectId, req.body.assigneeId))) {
      return res.status(422).json({ message: 'Assignee must be a project member' });
    }

    const task = await prisma.task.create({
      data: {
        title: req.body.title,
        description: req.body.description,
        status: req.body.status || 'TODO',
        priority: req.body.priority || 'MEDIUM',
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        projectId: req.projectId,
        assigneeId: req.body.assigneeId || null,
        creatorId: req.user.id
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });

    res.status(201).json({ task });
  })
);

router.patch(
  '/:taskId',
  [
    param('taskId').isString(),
    body('title').optional().trim().isLength({ min: 2 }).withMessage('Task title must be at least 2 characters'),
    body('description').optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage('Description is too long'),
    body('status').optional().isIn(['TODO', 'IN_PROGRESS', 'DONE']).withMessage('Invalid status'),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid priority'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Due date must be a valid date'),
    body('assigneeId').optional({ nullable: true }).isString().withMessage('Invalid assignee'),
    handleValidation
  ],
  asyncHandler(async (req, res, next) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    req.body.projectId = task.projectId;
    req.task = task;
    next();
  }),
  loadMembership,
  asyncHandler(async (req, res) => {
    const isAdmin = req.membership.role === 'ADMIN';
    const isAssignee = req.task.assigneeId === req.user.id;
    const onlyStatus = Object.keys(req.body).every((key) => ['status', 'projectId'].includes(key));

    if (!isAdmin && !(isAssignee && onlyStatus)) {
      return res.status(403).json({ message: 'Members can only update status on assigned tasks' });
    }

    if (req.body.assigneeId && !(await ensureAssigneeInProject(req.projectId, req.body.assigneeId))) {
      return res.status(422).json({ message: 'Assignee must be a project member' });
    }

    const task = await prisma.task.update({
      where: { id: req.params.taskId },
      data: {
        title: req.body.title,
        description: req.body.description,
        status: req.body.status,
        priority: req.body.priority,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : req.body.dueDate === null ? null : undefined,
        assigneeId: req.body.assigneeId
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });

    res.json({ task });
  })
);

router.delete(
  '/:taskId',
  [param('taskId').isString(), handleValidation],
  asyncHandler(async (req, res, next) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    req.body.projectId = task.projectId;
    next();
  }),
  loadMembership,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.task.delete({ where: { id: req.params.taskId } });
    res.status(204).end();
  })
);

export default router;
