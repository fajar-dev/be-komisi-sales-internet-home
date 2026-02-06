import { Context } from "hono";
import { EmployeeService } from "../service/employee.service";
import { ApiResponseHandler } from "../helper/api-response";

export class EmployeeController {
    constructor(
        private employeeService = EmployeeService,
        private apiResponse = ApiResponseHandler,
    ) {}

    async getEmployeeByEmployeeId(c: Context) {
        try {
            const employeeId = c.req.param('id');
            const result = await this.employeeService.getEmployeeByEmployeeId(employeeId);
            if(!result){
                return c.json(this.apiResponse.error('Employee not found'), 404);
            }
            return c.json(this.apiResponse.success("Employee retrieved successfully", result));
        } catch (error: any) {
            return c.json(this.apiResponse.error('Failed to retrieve employee', error.message));
        }
    }

    async getEmployeeHierarchy(c: Context) {
        try {
            const employeeId = c.req.param('id');
            const hierarchy = await this.employeeService.getHierarchy(employeeId);

            return c.json(this.apiResponse.success("Employee hierarchy retrieved successfully", hierarchy));
        } catch (error: any) {
            return c.json(this.apiResponse.error('Failed to retrieve employee hierarchy', error.message));
        }
    }
}   