import { Context, Next } from "hono";
import { EmployeeService } from "../service/employee.service";
import { ApiResponseHandler } from "../helper/api-response";

export const hierarchyMiddleware = async (c: Context, next: Next) => {
    try {
        const user = c.get('user');
        const targetEmployeeId = c.req.param('id');

        if (!user || !user.sub) {
            return c.json(ApiResponseHandler.error('Unauthorized: User identity missing'), 401);
        }

        const currentEmployeeId = user.sub;

        // Fetch hierarchy for the current user
        // This returns the current user and all subordinates
        const hierarchy = await EmployeeService.getHierarchy(currentEmployeeId);

        // Check if the target employee ID exists in the hierarchy list
        const isAuthorized = hierarchy.some((emp: any) => emp.employee_id === targetEmployeeId);

        if (!isAuthorized) {
            return c.json(ApiResponseHandler.error('Forbidden: You do not have access to this resource'), 403);
        }

        await next();
    } catch (error: any) {
        return c.json(ApiResponseHandler.error('Hierarchy check failed', error.message), 500);
    }
};
