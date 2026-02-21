import { Hono } from 'hono';
import { AuthController } from '../controller/auth.controller';

import { authMiddleware } from '../middleware/auth.middleware';
import { EmployeeController } from '../controller/employee.controller';
import { hierarchyMiddleware } from '../middleware/hierarchy.middleware';
import { AdditionalController } from '../controller/additional.controller';
import { AdjustmentController } from '../controller/adjustment.controller';
import { SnapshotController } from '../controller/snapshot.controller';
import { CommissionController } from '../controller/commission.controller';


const route = new Hono();

const authController = new AuthController();
route.post('/auth/google', (c) => authController.google(c));
route.post('/auth/login', (c) => authController.login(c));
route.post('/auth/dev', (c) => authController.devLogin(c));
route.post('/auth/refresh', (c) => authController.refresh(c));
route.get('/auth/me', (c) => authController.me(c));
route.post('/auth/logout', (c) => authController.logout(c));


route.get('/additional', (c) => new AdditionalController().getPeriod(c));

route.get('/employee/:id', authMiddleware, (c) => new EmployeeController().getEmployeeByEmployeeId(c));
route.get('/employee/:id/hierarchy', authMiddleware, (c) => new EmployeeController().getEmployeeHierarchy(c));

route.get('/sales/:id/commission', authMiddleware, hierarchyMiddleware, (c) => new CommissionController().salesCommission(c));
route.get('/sales/:id/commission/period', authMiddleware, hierarchyMiddleware, (c) => new CommissionController().salesCommissionPeriod(c));

route.get('/manager/:id/commission', authMiddleware, hierarchyMiddleware, (c) => new CommissionController().managerCommission(c));
route.get('/manager/:id/commission/period', authMiddleware, hierarchyMiddleware, (c) => new CommissionController().managerCommissionPeriod(c));

route.get('/sales/:id/invoice', authMiddleware, hierarchyMiddleware,  (c) => new SnapshotController().salesInvoice(c));
route.get('/sales/:id/invoice/:ai', authMiddleware, hierarchyMiddleware, (c) => new SnapshotController().salesSnapshotByAi(c));
route.get('/manager/:id/team', authMiddleware, hierarchyMiddleware, (c) => new SnapshotController().managerTeamCommission(c));

route.get('/adjustment', authMiddleware, (c) => new AdjustmentController().getAdjustment(c));
route.post('/adjustment', authMiddleware, (c) => new AdjustmentController().insertAdjustment(c));
route.post('/adjustment/:id/accept', authMiddleware, (c) => new AdjustmentController().acceptAdjustment(c));
route.post('/adjustment/:id/decline', authMiddleware, (c) => new AdjustmentController().declineAdjustment(c));
route.get('/adjustment/history', authMiddleware, (c) => new AdjustmentController().getAdjustmentHistory(c));

export default route;
