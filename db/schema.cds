namespace audit;

using {cuid} from '@sap/cds/common';

entity UserAuditReport : cuid {
    system         : String(50); // System
    timestamp      : Timestamp; // Timestamp (UTC)
    eventType      : String(50); // Event Type
    event          : String(100); // Event
    userId         : String(100); // User ID
    userName       : String(100); // User Name
    userType       : String(50); // User Type
    roleCollection : String(100); // Role Collection
    fieldChanged   : String(100); // Field Changed
    oldValue       : String(255); // Old Value
    newValue       : String(255); // New Value
    performedBy    : String(100); // Performed By
    userRole       : String(100); // User Role
    status         : String(20); // Status
    subaccount     : String(100); // Subaccount
}

entity RoleAuditReport : cuid {
    system          : String(50); // System
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

entity ConfigurationReport : cuid {
    system          : String(50);
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
    system        : String(50);  // System
    subaccount    : String(100); // Subaccount
    serviceName   : String(100); // Service Name
    planName      : String(100); // Plan Name
    status        : String(50);  // Status
    createdOn     : Timestamp;   // Created On
    createdBy     : String(100); // Created By
    changedOn     : Timestamp;   // Changed On
    changedBy     : String(100); // Changed By
}
