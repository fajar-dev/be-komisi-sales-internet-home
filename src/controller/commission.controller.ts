import { Context } from "hono";
import { ApiResponseHandler } from "../helper/api-response";
import { CommissionHelper } from "../helper/commission.helper";
import { IsService } from "../service/is.service";
import { EmployeeService } from "../service/employee.service";
import { SnapshotService } from "../service/snapshot.service";

export class CommissionController {
    constructor(
        private snapshotService = SnapshotService,  
        private employeeService = EmployeeService,
        private isService = IsService,
        private commissionHelper = CommissionHelper,
        private apiResponse = ApiResponseHandler,
    ) {}

    async salesCommission(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const year = Number(c.req.query("year"));

            const annual = await this.commissionHelper.processAnnualCommission(year, async (startDate, endDate) => {
                const rows = await this.snapshotService.getSnapshotBySales(employeeId, startDate, endDate);
                
                const stats = this.commissionHelper.initStats();
                const detail = this.commissionHelper.initDetail();
                const serviceMap: Record<string, any> = this.commissionHelper.initServiceMap();

                rows.forEach((row: any) => {
                    if (row.is_deleted) return;

                    const commission = this.commissionHelper.toNum(row.sales_commission);
                    const mrc = this.commissionHelper.toNum(row.mrc);
                    const dpp = this.commissionHelper.toNum(row.dpp);
                    let type = (row.type || 'recurring') as any;
                    if (type === 'prorata') type = 'prorate';
                    
                    const safeType = type as keyof typeof detail;
                    const serviceName = this.commissionHelper.getServiceName(row.service_id);

                    // Monthly Totals
                    stats.count++;
                    stats.commission += commission;
                    stats.mrc += mrc;
                    stats.dpp += dpp;

                    // Detail by Type
                    if (detail[safeType]) {
                        detail[safeType].count++;
                        detail[safeType].commission += commission;
                        detail[safeType].mrc += mrc;
                        detail[safeType].dpp += dpp;
                    }

                    // Service Breakdown
                    if (serviceMap[serviceName]) {
                        serviceMap[serviceName].count++;
                        serviceMap[serviceName].commission += commission;
                        serviceMap[serviceName].mrc += mrc;
                        serviceMap[serviceName].dpp += dpp;
                        
                        if (serviceMap[serviceName].detail[safeType]) {
                            serviceMap[serviceName].detail[safeType].count++;
                            serviceMap[serviceName].detail[safeType].commission += commission;
                            serviceMap[serviceName].detail[safeType].mrc += mrc;
                            serviceMap[serviceName].detail[safeType].dpp += dpp;
                        }
                    }
                });

                const service = Object.values(serviceMap).map((s: any) => ({
                    ...s,
                    commission: this.commissionHelper.formatCurrency(s.commission),
                    mrc: this.commissionHelper.formatCurrency(s.mrc),
                    dpp: this.commissionHelper.formatCurrency(s.dpp),
                    detail: {
                        new: { ...s.detail.new, commission: this.commissionHelper.formatCurrency(s.detail.new.commission), mrc: this.commissionHelper.formatCurrency(s.detail.new.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.new.dpp) },
                        prorate: { ...s.detail.prorate, commission: this.commissionHelper.formatCurrency(s.detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(s.detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.prorate.dpp) },
                        recurring: { ...s.detail.recurring, commission: this.commissionHelper.formatCurrency(s.detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(s.detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.recurring.dpp) }
                    }
                }));

                return {
                    total: stats.commission,
                    detail: {
                        commission: this.commissionHelper.formatCurrency(stats.commission),
                        mrc: this.commissionHelper.formatCurrency(stats.mrc),
                        dpp: this.commissionHelper.formatCurrency(stats.dpp),
                        count: stats.count,
                        detail: {
                            new: { ...detail.new, commission: this.commissionHelper.formatCurrency(detail.new.commission), mrc: this.commissionHelper.formatCurrency(detail.new.mrc), dpp: this.commissionHelper.formatCurrency(detail.new.dpp) },
                            prorate: { ...detail.prorate, commission: this.commissionHelper.formatCurrency(detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(detail.prorate.dpp) },
                            recurring: { ...detail.recurring, commission: this.commissionHelper.formatCurrency(detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(detail.recurring.dpp) }
                        },
                        service
                    }
                } as any;
            });

            // Aggregate Yearly Data
            const yearlyStats = this.commissionHelper.initStats();
            const yearlyDetail = this.commissionHelper.initDetail();
            const yearlyServiceMap: any = this.commissionHelper.initServiceMap();

            const monthlyData: Record<string, any> = {};

            annual.data.forEach((monthItem: any) => {
                const monthName = monthItem.month;
                const mData = monthItem.detail;

                monthlyData[monthName] = mData;

                // Aggregate Yearly
                yearlyStats.count += mData.count;
                yearlyStats.commission += Number(mData.commission);
                yearlyStats.mrc += Number(mData.mrc);
                yearlyStats.dpp += Number(mData.dpp);

                // Detail
                ['new', 'prorate', 'recurring'].forEach((key: string) => {
                    const k = key as keyof typeof yearlyDetail;
                    yearlyDetail[k].count += mData.detail[k].count;
                    yearlyDetail[k].commission += Number(mData.detail[k].commission);
                    yearlyDetail[k].mrc += Number(mData.detail[k].mrc);
                    yearlyDetail[k].dpp += Number(mData.detail[k].dpp);
                });

                // Service
                mData.service.forEach((s: any) => {
                    const sName = s.name;
                    if (yearlyServiceMap[sName]) {
                        yearlyServiceMap[sName].count += s.count;
                        yearlyServiceMap[sName].commission += Number(s.commission);
                        yearlyServiceMap[sName].mrc += Number(s.mrc);
                        yearlyServiceMap[sName].dpp += Number(s.dpp);

                        ['new', 'prorate', 'recurring'].forEach((key: string) => {
                            const k = key as keyof typeof yearlyDetail;
                            yearlyServiceMap[sName].detail[k].count += s.detail[k].count;
                            yearlyServiceMap[sName].detail[k].commission += Number(s.detail[k].commission);
                            yearlyServiceMap[sName].detail[k].mrc += Number(s.detail[k].mrc);
                            yearlyServiceMap[sName].detail[k].dpp += Number(s.detail[k].dpp);
                        });
                    }
                });
            });

            const yearlyService = Object.values(yearlyServiceMap).map((s: any) => ({
                ...s,
                commission: this.commissionHelper.formatCurrency(s.commission),
                mrc: this.commissionHelper.formatCurrency(s.mrc),
                dpp: this.commissionHelper.formatCurrency(s.dpp),
                detail: {
                    new: { ...s.detail.new, commission: this.commissionHelper.formatCurrency(s.detail.new.commission), mrc: this.commissionHelper.formatCurrency(s.detail.new.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.new.dpp) },
                    prorate: { ...s.detail.prorate, commission: this.commissionHelper.formatCurrency(s.detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(s.detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.prorate.dpp) },
                    recurring: { ...s.detail.recurring, commission: this.commissionHelper.formatCurrency(s.detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(s.detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.recurring.dpp) }
                }
            }));

            const finalResult = {
                commission: this.commissionHelper.formatCurrency(yearlyStats.commission),
                mrc: this.commissionHelper.formatCurrency(yearlyStats.mrc),
                dpp: this.commissionHelper.formatCurrency(yearlyStats.dpp),
                count: yearlyStats.count,
                detail: {
                    new: { ...yearlyDetail.new, commission: this.commissionHelper.formatCurrency(yearlyDetail.new.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.new.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.new.dpp) },
                    prorate: { ...yearlyDetail.prorate, commission: this.commissionHelper.formatCurrency(yearlyDetail.prorate.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.prorate.dpp) },
                    recurring: { ...yearlyDetail.recurring, commission: this.commissionHelper.formatCurrency(yearlyDetail.recurring.commission), mrc: this.commissionHelper.formatCurrency(yearlyDetail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(yearlyDetail.recurring.dpp) }
                },
                service: yearlyService,
                monthly: monthlyData
            };

            return c.json(this.apiResponse.success("Count retrieved successfully", finalResult));
        } catch (error: any) {
            return c.json(this.apiResponse.error("An error occurred", error.message), 500);
        }
    }

    async salesCommissionPeriod(c: Context) {
        try {
            const employeeId = c.req.param("id");
            const startDate = c.req.query("start");
            const endDate = c.req.query("end");
            const status = c.req.query("status");

            if (!startDate || !endDate) {
                return c.json(this.apiResponse.error("Missing start or end date", undefined), 400);
            }

            const rows = await this.snapshotService.getSnapshotBySales(employeeId, startDate, endDate);
            
            const stats = this.commissionHelper.initStats();
            const detail = this.commissionHelper.initDetail();
            const serviceMap: Record<string, any> = this.commissionHelper.initServiceMap();

            rows.forEach((row: any) => {
                if (row.is_deleted) return;

                const commission = this.commissionHelper.toNum(row.sales_commission);
                const mrc = this.commissionHelper.toNum(row.mrc);
                const dpp = this.commissionHelper.toNum(row.dpp);
                let type = (row.type || 'recurring') as any;
                if (type === 'prorata') type = 'prorate';
                
                const safeType = type as keyof typeof detail;
                const serviceName = this.commissionHelper.getServiceName(row.service_id);

                // Totals
                stats.count++;
                stats.commission += commission;
                stats.mrc += mrc;
                stats.dpp += dpp;

                // Detail by Type
                if (detail[safeType]) {
                    detail[safeType].count++;
                    detail[safeType].commission += commission;
                    detail[safeType].mrc += mrc;
                    detail[safeType].dpp += dpp;
                }

                // Service Breakdown
                if (serviceMap[serviceName]) {
                    serviceMap[serviceName].count++;
                    serviceMap[serviceName].commission += commission;
                    serviceMap[serviceName].mrc += mrc;
                    serviceMap[serviceName].dpp += dpp;
                    
                    if (serviceMap[serviceName].detail[safeType]) {
                        serviceMap[serviceName].detail[safeType].count++;
                        serviceMap[serviceName].detail[safeType].commission += commission;
                        serviceMap[serviceName].detail[safeType].mrc += mrc;
                        serviceMap[serviceName].detail[safeType].dpp += dpp;
                    }
                }
            });

            const service = Object.values(serviceMap).map((s: any) => ({
                ...s,
                commission: this.commissionHelper.formatCurrency(s.commission),
                mrc: this.commissionHelper.formatCurrency(s.mrc),
                dpp: this.commissionHelper.formatCurrency(s.dpp),
                detail: {
                    new: { ...s.detail.new, commission: this.commissionHelper.formatCurrency(s.detail.new.commission), mrc: this.commissionHelper.formatCurrency(s.detail.new.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.new.dpp) },
                    prorate: { ...s.detail.prorate, commission: this.commissionHelper.formatCurrency(s.detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(s.detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.prorate.dpp) },
                    recurring: { ...s.detail.recurring, commission: this.commissionHelper.formatCurrency(s.detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(s.detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(s.detail.recurring.dpp) }
                }
            }));

            const finalResult = {
                commission: this.commissionHelper.formatCurrency(stats.commission),
                mrc: this.commissionHelper.formatCurrency(stats.mrc),
                dpp: this.commissionHelper.formatCurrency(stats.dpp),
                count: stats.count,
                detail: {
                    new: { ...detail.new, commission: this.commissionHelper.formatCurrency(detail.new.commission), mrc: this.commissionHelper.formatCurrency(detail.new.mrc), dpp: this.commissionHelper.formatCurrency(detail.new.dpp) },
                    prorate: { ...detail.prorate, commission: this.commissionHelper.formatCurrency(detail.prorate.commission), mrc: this.commissionHelper.formatCurrency(detail.prorate.mrc), dpp: this.commissionHelper.formatCurrency(detail.prorate.dpp) },
                    recurring: { ...detail.recurring, commission: this.commissionHelper.formatCurrency(detail.recurring.commission), mrc: this.commissionHelper.formatCurrency(detail.recurring.mrc), dpp: this.commissionHelper.formatCurrency(detail.recurring.dpp) }
                },
                service
            };

            const newServiceCount = detail.new.count;
            let achievementStatus = "N/A";
            let motivation = "N/A";

            if (status === 'Permanent') {
                if (newServiceCount >= 15) {
                    achievementStatus = "Capai target Bonus";
                    motivation = "Congratulations on your outstanding achievement!";
                } else if (newServiceCount >= 12) {
                    achievementStatus = "Capai target";
                    motivation = "Bravo! Keep up the great work!";
                } else if (newServiceCount < 3) {
                    achievementStatus = "SP1";
                    motivation = "Keep fighting and don't give up!";
                } else {
                    achievementStatus = "Tidak Capai target";
                    motivation = "Just a little more fights, go on!";
                }
            } else if (status === 'Probation' || status === 'Contract') {
                if (newServiceCount >= 8) {
                    achievementStatus = "Excelent";
                    motivation = "Congratulations on your outstanding achievement!";
                } else if (newServiceCount >= 5) {
                    achievementStatus = "Very Good";
                    motivation = "Bravo! Keep up the great work!";
                } else if (newServiceCount >= 3) {
                    achievementStatus = "Average";
                    motivation = "You’re much better than what you think!";
                } else {
                    achievementStatus = "Below Average";
                    motivation = "Keep pushing!";
                }
            }

            return c.json(this.apiResponse.success("Commission period data retrieved successfully", {
                ...finalResult,
                achievement: {
                    status: achievementStatus,
                    motivation: motivation
                }
            }));
        } catch (error: any) {
            return c.json(this.apiResponse.error("An error occurred", error.message), 500);
        }
    }

}