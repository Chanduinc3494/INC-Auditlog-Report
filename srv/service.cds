using {audit as db} from '../db/schema';

service auditLoggingAndReportingService {
    entity UserAuditReports       as projection on db.UserAuditReport;

    entity RoleAuditReports       as
        projection on db.RoleAuditReport {
            *,
            virtual statusCriticality : Integer
        };

    entity ConfigurationReport    as
        projection on db.ConfigurationReport {
            *,
            virtual roleCriticality : Integer
        };

    @odata.draft.enabled
    // @requires: 'Admin'
    entity BTPConnection          as projection on db.BTPConnection;

    entity ReportSyncStatus       as projection on db.ReportSyncStatus;

    entity ServiceAuditReports    as
        projection on db.ServiceAuditReport
        excluding {
            serviceInstanceId,
            subaccountId
        };

    //for sync btn
    action   syncServiceLogs()             returns String;
    action   syncRoleLogs()                returns String;
    action   clearEntitlements()           returns String;
    function getServiceAuditStatus()       returns ReportSyncStatus;
    function getRoleAudiStatus()           returns ReportSyncStatus;
    function getConfigurationAuditStatus() returns ReportSyncStatus;


    @readonly
    entity UserSystemVH           as
        select from db.UserAuditReport {
            key system
        }
        group by
            system;

    @readonly
    entity UserEventTypeVH        as
        select from db.UserAuditReport {
            key eventType
        }
        group by
            eventType;

    @readonly
    entity UserEventVH            as
        select from db.UserAuditReport {
            key event
        }
        group by
            event;

    @readonly
    entity UserUserIdVH           as
        select from db.UserAuditReport {
            key userId
        }
        group by
            userId;

    @readonly
    entity UserUserNameVH         as
        select from db.UserAuditReport {
            key userName
        }
        group by
            userName;

    @readonly
    entity UserStatusVH           as
        select from db.UserAuditReport {
            key status
        }
        group by
            status;

    @readonly
    entity UserSubaccountVH       as
        select from db.UserAuditReport {
            key subaccount
        }
        group by
            subaccount;

    @readonly
    entity RoleSystemVH           as
        select from db.RoleAuditReport {
            key system
        }
        group by
            system;

    @readonly
    entity RoleCollectionVH       as
        select from db.RoleAuditReport {
            key roleCollection
        }
        group by
            roleCollection;

    @readonly
    entity RoleEventVH            as
        select from db.RoleAuditReport {
            key event
        }
        group by
            event;

    @readonly
    entity RoleStatusVH           as
        select from db.RoleAuditReport {
            key status
        }
        group by
            status;

    @readonly
    entity RoleUserRoleVH         as
        select from db.RoleAuditReport {
            key userRole
        }
        group by
            userRole;

    @readonly
    entity RoleSubaccountNameVH   as
        select from db.RoleAuditReport {
            key subaccountName
        }
        group by
            subaccountName;

    @readonly
    entity RoleChangedByVH        as
        select from db.RoleAuditReport {
            key changedByUserId
        }
        group by
            changedByUserId;

    @readonly
    entity ConfigSystemVH         as
        select from db.ConfigurationReport {
            key system
        }
        group by
            system;

    @readonly
    entity ConfigSubaccountVH     as
        select from db.ConfigurationReport {
            key subAccount
        }
        group by
            subAccount;

    @readonly
    entity ConfigRoleCollectionVH as
        select from db.ConfigurationReport {
            key userRole as roleCollection
        }
        group by
            userRole;

    @readonly
    entity ConfigEventVH          as
        select from db.ConfigurationReport {
            key eventType as event
        }
        group by
            eventType;

    @readonly
    entity ConfigUserIdVH         as
        select from db.ConfigurationReport {
            key userId
        }
        group by
            userId;

    @readonly
    entity ServiceSystemVH        as
        select from db.ServiceAuditReport {
            key system
        }
        group by
            system;

    @readonly
    entity ServiceSubaccountVH    as
        select from db.ServiceAuditReport {
            key subaccount
        }
        group by
            subaccount;

    @readonly
    entity ServiceNameVH          as
        select from db.ServiceAuditReport {
            key serviceName
        }
        group by
            serviceName;

    @readonly
    entity ServicePlanVH          as
        select from db.ServiceAuditReport {
            key planName
        }
        group by
            planName;

    @readonly
    entity ServiceStatusVH        as
        select from db.ServiceAuditReport {
            key status
        }
        group by
            status;

    @readonly
    entity ServiceCreatedByVH     as
        select from db.ServiceAuditReport {
            key createdBy
        }
        group by
            createdBy;

    @readonly
    entity ServiceChangedByVH     as
        select from db.ServiceAuditReport {
            key changedBy
        }
        group by
            changedBy;

   
    
    @readonly
    // @requires: 'Admin'
    entity BTPSubaccountVH        as
        select from db.BTPConnection {
            key subaccountName
        }
        group by
            subaccountName;
    @readonly
    // @requires: 'Admin'
    entity BTPServiceTypeVH {
        key code : String(30);
    }
    //job scheduling actions
    @requires: 'JobScheduler'
    action   scheduledSyncRoleLogs()       returns String;

}
