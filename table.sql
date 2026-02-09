CREATE TABLE snapshot (
    ai INT NOT NULL,
    customer_id  VARCHAR(255) NULL,
    customer_name VARCHAR(255) NULL,
    customer_company VARCHAR(255) NULL,
    customer_service_id  VARCHAR(100) NULL,
    customer_service_account VARCHAR(255) NULL,
    service_group_id  VARCHAR(100) NULL,
    service_id VARCHAR(100) NULL,
    service_name VARCHAR(255) NULL,
    invoice_number VARCHAR(255) NULL,
    invoice_order INT NULL,
    invoice_date DATE NULL,
    month INT NULL,
    dpp DECIMAL(10, 2) NULL,
    new_subscription DECIMAL(10, 2) NULL,
    paid_date DATETIME NULL,
    counter INT NULL,
    type ENUM('new', 'prorata', 'recurring', 'rent', 'buy') NOT NULL DEFAULT 'recurring',
    sales_id  VARCHAR(100) NULL,
    manager_id  VARCHAR(100) NULL,
    referral_id  VARCHAR(100) NULL,
    mrc DECIMAL(15, 2) NULL,
    sales_commission DECIMAL(15, 2) NULL,
    sales_commission_percentage DECIMAL(5, 2) NULL,
    is_adjustment BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE adjustment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ai INT NOT NULL,
    employee_id VARCHAR(20) NOT NULL,
    approved_id VARCHAR(20) NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    action ENUM('insert', 'update', 'delete') NOT NULL,
    status ENUM('pending', 'accept', 'decline') NOT NULL DEFAULT 'pending'
);

CREATE TABLE employee (
    id INT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    photo_profile VARCHAR(255) NOT NULL,
    job_position VARCHAR(255) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    job_level VARCHAR(50) NOT NULL,
    branch VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    manager_id INT NULL,
    has_dashboard BOOLEAN NOT NULL DEFAULT false
);
