import { AdjustmentService } from "../service/adjustment.service";
import { Context } from "hono";
import { ApiResponseHandler } from "../helper/api-response";
import { EmployeeService } from "../service/employee.service";
import { SnapshotService } from "../service/snapshot.service";

export class AdjustmentController {
    constructor(
        private adjustmentService = AdjustmentService,
        private apiResponse = ApiResponseHandler,
        private employeeService = EmployeeService,
        private snapshotService = SnapshotService,
    ) {}

    async insertAdjustment(c: Context) {
        try {
            const data = await c.req.json();
            const user = c.get('user');
            const employee = await this.employeeService.getEmployeeByEmployeeId(user.sub);
            const request = {
                ai: data.ai,
                employeeId: user.sub,
                approvedId: employee?.managerEmployeeId,
                oldValue: data.oldValue,
                newValue: data.newValue,
                note: data.note,
                action: data.action,
            }
            await this.adjustmentService.insertAdjustment(request);
            return c.json(this.apiResponse.success("Adjustment inserted successfully"));
        } catch (error: any) {
            return c.json(this.apiResponse.error('Failed to insert adjustment', error.message), 500);
        }
    }

    async getAdjustment(c: Context) {
        try {
            const user = c.get('user');
            const result = await this.adjustmentService.getAdjustment(user.sub);
            return c.json(this.apiResponse.success("Adjustment retrieved successfully", result));
        } catch (error: any) {
            return c.json(this.apiResponse.error('Failed to retrieve adjustment', error.message), 500);
        }
    }

    async acceptAdjustment(c: Context) {
        try {
            const id = Number(c.req.param('id'));
            const user = c.get('user');
            const result = await this.adjustmentService.acceptAdjustment(id, user.sub);
            if(result){
                await this.snapshotService.updateSnapshot(result.ai, result.newValue, result.isDeleted);
            }

            return c.json(this.apiResponse.success("Adjustment accepted successfully", result));
        } catch (error: any) {
            return c.json(this.apiResponse.error('Failed to accept adjustment', error.message), 500);
        }
    }

    async declineAdjustment(c: Context) {
        try {
            const id = Number(c.req.param('id'));
            const user = c.get('user');
            const result = await this.adjustmentService.declineAdjustment(id, user.sub);
            return c.json(this.apiResponse.success("Adjustment declined successfully", result));
        } catch (error: any) {
            return c.json(this.apiResponse.error('Failed to decline adjustment', error.message), 500);
        }
    }

    async getAdjustmentHistory(c: Context) {
        try {
            const user = c.get('user');
            const result = await this.adjustmentService.getAdjustmentHistory(user.sub);
            return c.json(this.apiResponse.success("Adjustment history retrieved successfully", result));
        } catch (error: any) {
            return c.json(this.apiResponse.error('Failed to retrieve adjustment history', error.message), 500);
        }
    }
}