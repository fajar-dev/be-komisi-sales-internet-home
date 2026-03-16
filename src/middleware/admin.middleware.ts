import { Context, Next } from "hono";
import { EmployeeService } from "../service/employee.service";
import { ApiResponseHandler } from "../helper/api-response";

export const adminMiddleware = async (c: Context, next: Next) => {
    try {
        const user = c.get('user');

        if (!user || !user.sub) {
            return c.json(ApiResponseHandler.error('Unauthorized: User identity missing'), 401);
        }

        const employeeId = user.sub;
        const employee = await EmployeeService.getEmployeeByEmployeeId(employeeId) as any;

        if (!employee) {
            return c.json(ApiResponseHandler.error('Unauthorized: Employee not found'), 401);
        }

        if (!employee.is_admin) {
            return c.json(ApiResponseHandler.error('Forbidden: Admin access required'), 403);
        }

        await next();
    } catch (error: any) {
        return c.json(ApiResponseHandler.error('Admin check failed', error.message), 500);
    }
};
