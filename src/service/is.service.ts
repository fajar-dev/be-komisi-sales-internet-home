import { nisPool } from "../config/nis.db"

export class IsService {

    static async getCustomerInvoiceByDateRange(startDate: string, endDate: string) {
        let query = `
            SELECT
                nci.AI AS ai,
                cit.CustId AS customer_id,
                c.CustName AS customer_name,
                c.CustCompany AS customer_company,
                cit.CustServId AS customer_service_id,
                cit.ServiceGroup AS service_group_id,
                s.ServiceId AS service_id,
                s.ServiceType AS service_name,
                IFNULL(citc.InvoiceDate, cit.InvoiceDate) AS invoice_date,
                IFNULL(itm.Month, 1) AS month,
                nciic.dpp AS dpp,
                nciic.new_subscription AS new_subscription,
                nci.InsertDate AS paid_date,
                nciic.counter AS counter,
                cit.InvoiceNum AS invoice_num,
                cit.Urut AS invoice_order,
                nciic.is_prorata,
                nciic.is_upgrade,
                cs.SalesId AS sales_id,
                cs.ManagerSalesId AS manager_id,
                cs.CustAccName AS customer_service_account,
                CASE
                    WHEN cs.ResellerType = 'referral' THEN cs.ResellerTypeId
                    ELSE NULL
                END AS referral_id
            FROM
                CustomerInvoiceTemp cit
                LEFT JOIN CustomerInvoiceTemp_Custom citc
                    ON cit.InvoiceNum = citc.InvoiceNum
                    AND cit.Urut = citc.Urut
                LEFT JOIN InvoiceTypeMonth itm
                    ON itm.InvoiceType = cit.InvoiceType
                LEFT JOIN NewCustomerInvoice nci
                    ON cit.InvoiceNum = nci.Id
                    AND nci.No = cit.Urut
                    AND nci.Type = 'internet'
                LEFT JOIN CustomerInvoiceDiscount cid
                    ON cid.InvoiceNum = cit.InvoiceNum
                    AND cid.Urut = cit.Urut
                LEFT JOIN NewCustomerInvoiceBatch ncib
                    ON nci.AI = ncib.AI
                LEFT JOIN NewCustomerInvoiceBatch ncib2
                    ON ncib.batchNo = ncib2.batchNo
                    AND ncib2.AI != ncib.AI
                    AND ncib2.total > 0
                LEFT JOIN NewCustomerInvoice nci2
                    ON ncib2.AI = nci2.AI
                LEFT JOIN CustomerServices cs
                    ON cit.CustServId = cs.CustServId
                LEFT JOIN Services s
                    ON s.ServiceId = cs.ServiceId
                LEFT JOIN ServiceGroup sg
                    ON sg.ServiceGroup = s.ServiceGroup
                LEFT JOIN Customer c
                    ON c.CustId = cs.CustId
                LEFT JOIN Reseller rs
                    ON c.ResellerId = rs.Id
                LEFT JOIN FiberVendorServices fvs
                    ON fvs.type = 'CustomerServices'
                    AND cs.CustServId = fvs.typeId
                LEFT JOIN NewCustomerInvoiceInternetCounter nciic
                    ON nciic.AI = nci.AI
            WHERE 
                cit.RInvoiceNum = 0
                AND (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
                AND (
                    IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
                    OR (
                        IFNULL(c.DisplayBranchId, c.BranchId) IN ('028')
                        AND nciic.new_subscription > 110000
                        AND cs.SalesId NOT IN ('0208801')
                    )
                )
                AND s.ServiceId IN ('BFLITE', 'NFSP030', 'NFSP100', 'NFSP200', 'HOME100', 'HOMEADV200', 'HOMEPREM300', 'HOMEADV')
                AND (
                    (DATE(nci.InsertDate) BETWEEN ? AND ?)
                    OR (nci2.TransDate IS NOT NULL AND nci2.TransDate BETWEEN ? AND ?)
                )
                AND cs.CustServId IS NOT NULL
                AND ncib.batchNo IS NOT NULL
            GROUP BY 
                nci.AI
            ORDER BY 
                nci.AI;
        `;

        const [rows] = await nisPool.query({
            sql: query,
        }, [startDate, endDate, startDate, endDate]);

        return rows as any[];
    }

}