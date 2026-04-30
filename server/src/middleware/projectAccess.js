import { prisma } from '../prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const loadMembership = asyncHandler(async (req, res, next) => {
  const projectId = req.params.projectId || req.body.projectId;

  if (!projectId) {
    return res.status(400).json({ message: 'Project id is required' });
  }

  const membership = await prisma.projectMembership.findUnique({
    where: {
      userId_projectId: {
        userId: req.user.id,
        projectId
      }
    }
  });

  if (!membership) {
    return res.status(403).json({ message: 'You do not have access to this project' });
  }

  req.projectId = projectId;
  req.membership = membership;
  next();
});

export const requireAdmin = (req, res, next) => {
  if (req.membership?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin role required' });
  }

  next();
};
