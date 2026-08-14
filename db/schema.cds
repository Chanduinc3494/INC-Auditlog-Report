namespace audit;

using {
    cuid,
    managed
} from '@sap/cds/common';

entity UserAuditReport : cuid {
    system         : String(50);
    timestamp      : Timestamp;
    eventType      : String(50);
    event          : String(100);
    userId         : String(100);
    userName       : String(100);
    userType       : String(1000);
    roleCollection : String(1000);
    fieldChanged   : String(100);
    oldValue       : String(255);
    newValue       : String(255);
    performedBy    : String(100);
    userRole       : String(1000);
    status         : String(20);
    subaccount     : String(100);
}
@assert.unique.auditEntry: [messageId]
entity RoleAuditReport : cuid {
    system          : String(50); // System
    messageId       : String(100); // Unique logs id
    roleCollection  : String(100); // Role Collection
    event           : String(100); // Event
    timestamp       : Timestamp; // Timestamp (UTC)
    changedByUserId : String(100); // Changed By (User ID)
    userRole        : String(100); // User Role
    fieldChanged    : String(100); // Field
    oldValue        : String(255); // Old Value
    newValue        : String(255); // New Value
    status          : String(20); // Status
    subaccountName  : String(100); // Subaccount Name
}
@assert.unique.auditEntry: [messageId]
entity ConfigurationReport : cuid {
    system          : String(50);
    messageId: String(100);
    userId          : String(100);
    userRole        : String(50);
    eventType       : String(50);
    btpService      : String(100);
    subAccount      : String(100);
    region          : String(100);
    actionPerformed : String(255);
    timestamp       : Timestamp;
}

entity ServiceAuditReport : cuid {
    system            : String(50); // System
    instance          : String(80);
    subaccountId      : String(100);
    serviceInstanceId : String(100);
    subaccount        : String(100); // Subaccount
    serviceName       : String(100); // Service Name
    planName          : String(100); // Plan Name
    status            : String(50); // Status
    createdOn         : Timestamp; // Created On
    createdBy         : String(100); // Created By
    changedOn         : Timestamp; // Changed On
    changedBy         : String(100); // Changed By
}

type ServiceType : String enum {
    AUDIT_LOG;
    SERVICE_MANAGER;
    ENTITLEMENTS;
    ACCOUNTS;
    SAAS_MANAGER;
    CLOUD_FOUNDRY;
};

entity BTPConnection : cuid, managed {
    // BTP Subaccount
    subaccountId   : String(100);
    subaccountName : String(100);
    // Type of external service
    serviceType    : ServiceType;
    // API connection
    tokenUrl       : String(500);
    apiBaseUrl     : String(500);
    // OAuth client credentials
    clientId       : String(255);
    clientSecret   : LargeString;
    // Only required if using CF password grant
    username       : String(255);
    password       : LargeString;
    active         : Boolean default true;
}

type ReportType  : String enum {
    USER_AUDIT;
    ROLE_AUDIT;
    CONFIGURATION;
    SERVICE_AUDIT;
    ENTITLEMENTS;
};

entity ReportSyncStatus : cuid, managed {
    reportName     : ReportType;
    // Last time the Sync action was triggered
    lastRunAt      : Timestamp;
    // Last time synchronization completed successfully
    lastSyncAt     : Timestamp;
    lastSyncStatus : String(20);
    // SUCCESS
    // FAILED
    // RUNNING
    lastSyncBy     : String(100);
    message        : String(500);
    isRunning      : Boolean default false;
}
