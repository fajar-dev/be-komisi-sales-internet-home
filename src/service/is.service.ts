import { nisPool } from "../config/nis.db"

export class IsService {
    static async getInvoiceByDateRange(startDate: string, endDate: string) {
        let query = `
            (
                SELECT
                    nci.AI                                                AS ai_invoice,
                    MAX(nci2.AI)                                          AS ai_receipt,
                    cit.CustId                                            AS customer_id,
                    c.CustName                                            AS customer_name,
                    c.CustCompany                                         AS customer_company,
                    cit.CustServId                                        AS customer_service_id,
                    cs.CustAccName                                        AS customer_service_account,
                    cit.ServiceGroup                                      AS service_group,
                    cs.ServiceId                                          AS service_id,
                    s.ServiceType                                         AS service_name,
                    cit.InvoiceNum                                        AS invoice_number,
                    cit.Urut                                              AS invoice_order,
                    IFNULL(citc.InvoiceDate, cit.InvoiceDate)             AS invoice_date,
                    IFNULL(citc.InvoiceExpDate, cit.InvoiceExpDate)       AS invoice_due_date,
                    cit.AwalPeriode                                       AS period_start,
                    cit.AkhirPeriode                                      AS period_end,
                    IFNULL(itm.Month, 1)                                  AS month,
                    CASE
                            WHEN nciic.new_subscription = 0 OR nciic.new_subscription IS NULL THEN nciic.dpp
                            ELSE nciic.new_subscription
                        END AS dpp,
                    MAX(nci2.TransDate)                                   AS paid_date,
                    nciic.new_subscription                                AS new_subscription,
                    nciic.counter                                         AS counter,
                    nciic.is_prorata                                      AS is_prorate,
                    nciic.is_upgrade                                      AS is_upgrade,
                    nciic.line_rental                                     AS line_rental,
                    'home'                                                AS category,
                    cs.SalesId                                            AS sales_id,
                    cs.ManagerSalesId                                     AS manager_id,
                    IFNULL(rs.Name, "")                                   AS reseller_name
                FROM
                    CustomerInvoiceTemp cit
                    LEFT JOIN CustomerInvoiceTemp_Custom citc
                        ON cit.InvoiceNum = citc.InvoiceNum
                    AND cit.Urut      = citc.Urut
                    LEFT JOIN InvoiceTypeMonth itm
                        ON itm.InvoiceType = cit.InvoiceType
                    LEFT JOIN NewCustomerInvoice nci
                        ON cit.InvoiceNum = nci.Id
                    AND nci.No         = cit.Urut
                    AND nci.Type       = 'internet'
                    LEFT JOIN CustomerInvoiceDiscount cid
                        ON cid.InvoiceNum = cit.InvoiceNum
                    AND cid.Urut       = cit.Urut
                    LEFT JOIN NewCustomerInvoiceBatch ncib
                        ON nci.AI = ncib.AI
                    LEFT JOIN NewCustomerInvoiceBatch ncib2
                        ON ncib.batchNo = ncib2.batchNo
                    AND ncib2.AI    != ncib.AI
                    AND ncib2.total  > 0
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
                        ON fvs.type      = 'CustomerServices'
                    AND cs.CustServId = fvs.typeId
                    LEFT JOIN NewCustomerInvoiceInternetCounter nciic
                        ON nciic.AI = nci.AI
                WHERE
                    cit.RInvoiceNum = 0
                    AND (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
                    AND ncib.batchNo IS NOT NULL
                    AND (
                        IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
                        OR (
                            IFNULL(c.DisplayBranchId, c.BranchId) IN ('028')
                            AND nciic.new_subscription > 110000
                            AND cs.SalesId NOT IN ('0208801')
                        )
                    )
                    AND s.ServiceId IN ('BFLITE', 'NFSP030', 'NFSP100', 'NFSP200', 'CBSHM', 'HOME30', 'HOME50', 'HOME100', 'HOME300', 'HOMESTD100', 'HOMEADV', 'HOMEADV200', 'HOMEPREM300', 'BOOSTER100', 'BOOSTER200', 'BOOSTER300')
                    AND (
                        (DATE(nci.InsertDate) BETWEEN ? AND ?)
                        OR (nci2.TransDate IS NOT NULL AND nci2.TransDate BETWEEN ? AND ?)
                    )
                    AND cs.CustServId IS NOT NULL
                GROUP BY
                    nci.AI
                ORDER BY
                    nci.AI
            )
            UNION ALL
            (
                SELECT
                    nci.AI                                                AS ai_invoice,
                    MAX(nci2.AI)                                          AS ai_receipt,
                    cit.cid                                               AS customer_id,
                    c.CustName                                            AS customer_name,
                    c.CustCompany                                         AS customer_company,
                    cit.csid                                              AS customer_service_id,
                    cs.CustAccName                                        AS customer_service_account,
                    s.ServiceGroup                                        AS service_group,
                    cs.ServiceId                                          AS service_id,
                    s.ServiceType                                         AS service_name,
                    cit.siid                                              AS invoice_number,
                    NULL                                                  AS invoice_order,
                    cit.date                                              AS invoice_date,
                    cit.due_date                                          AS invoice_due_date,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_start,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_end,
                    1                                                     AS month,
                    cit.dpp                                               AS dpp,
                    MAX(nci2.TransDate)                                   AS paid_date,
                    ''                                                    AS new_subscription,
                    ''                                                    AS counter,
                    ''                                                    AS is_prorate,
                    0                                                     AS is_upgrade,
                    0                                                     AS line_rental,
                    'alat'                                                AS category, 
                    cs.SalesId                                            AS sales_id,
                    cs.ManagerSalesId                                     AS manager_id,
                    IFNULL(rs.Name, "")                                   AS reseller_name
                FROM
                    (
                        SELECT
                            sih.CustId                                    AS cid,
                            sih.No                                        AS siid,
                            sh.CustServId                                 AS csid,
                            sih.Date                                      AS date,
                            sih.DueDate                                   AS due_date,
                            ROUND(SUM((si.Unit - si.Free) * si.Price) / 1.11, 2) AS dpp,
                            si.Code                                       AS Code
                        FROM
                            StockInvoice si
                            LEFT JOIN StockInvoiceHead sih ON sih.No = si.No
                            LEFT JOIN SPMBHead sh         ON sh.No  = sih.Spmb
                        WHERE
                            sih.Status = 'BL'
                            AND sih.RNo = 0
                            AND (sh.CustServId != 0 OR sih.No IN (0000130674))
                            AND si.Code NOT IN (
                                'SETUP000','JSTRKKBL','TARIKKBL','TOWER000','TARIKKBV','INSTALWF',
                                'TRKKBLDT','TRKKBLFO','MNTNCE00','JSSETTAP','TARKBLFO'
                            )
                        GROUP BY
                            sih.No
                        HAVING
                            dpp != 0
                        ORDER BY
                            sih.No
                    ) cit
                    LEFT JOIN NewCustomerInvoice nci
                        ON nci.Id   = cit.siid
                    AND nci.Type = 'stock'
                    LEFT JOIN NewCustomerInvoiceBatch ncib
                        ON nci.AI = ncib.AI
                    LEFT JOIN NewCustomerInvoiceBatch ncib2
                        ON ncib.batchNo = ncib2.batchNo
                    AND ncib2.AI    != ncib.AI
                    AND ncib2.total  > 0
                    LEFT JOIN NewCustomerInvoice nci2
                        ON ncib2.AI = nci2.AI
                    LEFT JOIN CustomerServices cs
                        ON cit.csid = cs.CustServId
                    LEFT JOIN Services s
                        ON s.ServiceId = cs.ServiceId
                    LEFT JOIN Customer c
                        ON c.CustId = cs.CustId
                    LEFT JOIN Reseller rs
                        ON c.ResellerId = rs.Id
                WHERE
                    (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
                    AND ncib.batchNo IS NOT NULL
                    AND (IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029'))
                    AND (
                        (cit.date BETWEEN ? AND ?)
                        OR (nci2.TransDate BETWEEN ? AND ?)
                    )
                    AND (nci.AI NOT IN (1463680))
                GROUP BY
                    nci.AI
                ORDER BY
                    nci.AI
            )
            UNION ALL
            (
                SELECT
                    nci.AI                                                AS ai_invoice,
                    MAX(nci2.AI)                                          AS ai_receipt,
                    cit.cid                                               AS customer_id,
                    c.CustName                                            AS customer_name,
                    c.CustCompany                                         AS customer_company,
                    cit.csid                                              AS customer_service_id,
                    cs.CustAccName                                        AS customer_service_account,
                    s.ServiceGroup                                        AS service_group,
                    cs.ServiceId                                          AS service_id,
                    s.ServiceType                                         AS service_name,
                    cit.siid                                              AS invoice_number,
                    NULL                                                  AS invoice_order,
                    cit.date                                              AS invoice_date,
                    cit.due_date                                          AS invoice_due_date,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_start,
                    DATE_FORMAT(cit.date, '%Y%m')                         AS period_end,
                    1                                                     AS month,
                    cit.dpp                                               AS dpp,
                    MAX(nci2.TransDate)                                   AS paid_date,
                    ''                                                    AS new_subscription,
                    ''                                                    AS counter,
                    ''                                                    AS is_prorate,
                    0                                                     AS is_upgrade,
                    0                                                     AS line_rental,
                    'setup'                                               AS category,
                    cs.SalesId                                            AS sales_id,
                    cs.ManagerSalesId                                     AS manager_id,
                    IFNULL(rs.Name, "")                                   AS reseller_name
                FROM
                    (
                        SELECT
                            sih.CustId                                    AS cid,
                            sih.No                                        AS siid,
                            sh.CustServId                                 AS csid,
                            sih.Date                                      AS date,
                            sih.DueDate                                   AS due_date,
                            ROUND(SUM((si.Unit - si.Free) * si.Price) / 1.11, 2) AS dpp,
                            si.Code                                       AS Code
                        FROM
                            StockInvoice si
                            LEFT JOIN StockInvoiceHead sih ON sih.No = si.No
                            LEFT JOIN SPMBHead sh         ON sh.No  = sih.Spmb
                        WHERE
                            sih.Status = 'BL'
                            AND sih.RNo = 0
                            AND sh.CustServId != 0
                            AND si.Code IN (
                                'SETUP000','JSTRKKBL','TARIKKBL','TARIKKBV','TRKKBLDT',
                                'TRKKBLFO','INSTALWF','MNTNCE00','JSSETTAP','TARKBLFO'
                            )
                        GROUP BY
                            sih.No
                        HAVING
                            dpp != 0
                        ORDER BY
                            sih.No
                    ) cit
                    LEFT JOIN NewCustomerInvoice nci
                        ON nci.Id   = cit.siid
                    AND nci.Type = 'stock'
                    LEFT JOIN NewCustomerInvoiceBatch ncib
                        ON nci.AI = ncib.AI
                    LEFT JOIN NewCustomerInvoiceBatch ncib2
                        ON ncib.batchNo = ncib2.batchNo
                    AND ncib2.AI    != ncib.AI
                    AND ncib2.total  > 0
                    LEFT JOIN NewCustomerInvoice nci2
                        ON ncib2.AI = nci2.AI
                    LEFT JOIN CustomerServices cs
                        ON cit.csid = cs.CustServId
                    LEFT JOIN Services s
                        ON s.ServiceId = cs.ServiceId
                    LEFT JOIN Customer c
                        ON c.CustId = cs.CustId
                    LEFT JOIN Reseller rs
                        ON c.ResellerId = rs.Id
                WHERE
                    (ncib.batchNo IS NULL OR nci2.Type = 'RA02')
                    AND ncib.batchNo IS NOT NULL
                    AND (IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029'))
                    AND (
                        (cit.date BETWEEN ? AND ?)
                        OR (nci2.TransDate BETWEEN ? AND ?)
                    )
                    AND (nci.AI NOT IN (1463679))
                GROUP BY
                    nci.AI
                ORDER BY
                    nci.AI
            );
        `;

        const [rows] = await nisPool.query({
            sql: query,
        }, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate ]);

        return rows as any[];
    }

    static async getChurnbyDateRange(startDate: string, endDate: string) {
        const query = `
            SELECT  
                cs.CustId AS customer_id,
                c.CustName AS customer_name,
                cs.CustServId AS customer_service_id,
                cs.CustAccName AS customer_service_account,
                cs.ServiceId AS service_id,
                s.ServiceType AS service_name,
                cs.CustActivationDate AS registration_date,
                cs.CustUnregDate AS unregistration_date,
                cs.CustCloseReason AS reason,
                cs.SalesId AS sales_id,
                cs.ManagerSalesId AS manager_id,
                cs.Subscription AS subscription,
                cs.Discount AS discount,
                IFNULL(itm.Month, 1) AS period,
                (cs.Subscription - cs.Discount) / IFNULL(itm.Month, 1) AS price
            FROM CustomerServices cs 
            LEFT JOIN Customer c ON c.CustId = cs.CustId 
            LEFT JOIN Services s ON s.ServiceId = cs.ServiceId
            LEFT JOIN InvoiceTypeMonth itm ON itm.InvoiceType = cs.InvoiceType
            WHERE cs.ServiceId IN ('BFLITE', 'CBSHM', 'HOME30', 'HOME50', 'HOME100', 'HOME300', 'HOMESTD100', 'HOMEADV', 'HOMEADV200', 'HOMEPREM300', 'BOOSTER100', 'BOOSTER200', 'BOOSTER300')
            AND cs.CustStatus = 'NA' 
            AND cs.CustUnregDate BETWEEN ? AND ?
            -- AND cs.CustUnregDate < DATE_ADD(cs.CustRegDate, INTERVAL IFNULL(itm.Month, 12) MONTH)
            AND cs.CustUnregDate <= DATE_ADD(cs.CustRegDate, INTERVAL 1 YEAR)
            AND (
                IFNULL(c.DisplayBranchId, c.BranchId) IN ('020', '062', '025', '027', '029')
                OR (
                    IFNULL(c.DisplayBranchId, c.BranchId) = '028'
                    AND cs.SalesId NOT IN ('0208801')
                )
            );
        `;
        const [rows] = await nisPool.query({
            sql: query,
        }, [startDate, endDate]);
        return rows as any[];
    }

}