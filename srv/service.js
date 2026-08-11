const cds = require("@sap/cds");
const audit = require("../lib/auditLog");
const authCsm = require("../lib/authCms");

const { fetchEntitlementsLogs, fetchAccountDirectory } = require("../lib/cloudservice");
const authServiceManager = require("../lib/authServiceMgr");
const { fetchServiceInstances, fetchServiceOfferings, fetchServicePlans } = require("../lib/serviceAuditfns")
const { SELECT } = require("@sap/cds/lib/ql/cds-ql");
module.exports = cds.service.impl(async function () {
    const db = await cds.connect.to("db");
    const {
        UserAuditReport,
        ServiceAuditReport,
        BTPConnection,
        ReportSyncStatus
    } = db.entities;
    try {
        const token = await authCsm.getToken();


        const subaccounts = await fetchAccountDirectory(token);

        for (const subaccount of subaccounts.value) {
            await fetchEntitlementsLogs(token, subaccount.guid);
        }

        console.log("Initial sync completed");
    } catch (err) {
        console.error("Startup sync failed:", err);
    }
    this.after("READ", "RoleAuditReports", (results) => {
        if (!results) return;
        const items = Array.isArray(results) ? results : [results];
        for (const item of items) {
            if (item.status === "Success") {
                item.statusCriticality = 3; // Positive (green)
            } else if (item.status === "Failure") {
                item.statusCriticality = 1; // Negative (red)
            } else {
                item.statusCriticality = 0; // Neutral
            }
        }
    });

    this.after("READ", "ConfigurationReport", (results) => {
        if (!results) return;
        const items = Array.isArray(results) ? results : [results];
        for (const item of items) {
            if (item.userRole === "App_Dev") {
                item.roleCriticality = 2; // Critical (yellow)
            } else {
                item.roleCriticality = 0; // Neutral
            }
        }
    });


    // service logs
    this.on("syncServiceLogs", async (req) => {


        await UPDATE(ReportSyncStatus)
            .set({
                isRunning: true,
                lastSyncStatus: "RUNNING"
            })
            .where({
                reportName: "SERVICE_AUDIT"
            });

        try {

            const connections = await SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "SERVICE_MANAGER",
                    active: true
                });

            for (const connection of connections) {

                const token = await authServiceManager.getToken(connection);

                const sapBtpPlans = await fetchServicePlans(
                    connection.apiBaseUrl,
                    token,
                    "sapbtp"
                );

                const cloudFoundryPlans = await fetchServicePlans(
                    connection.apiBaseUrl,
                    token,
                    "cloudfoundry"
                );

                const plans = [
                    ...sapBtpPlans,
                    ...cloudFoundryPlans
                ];
                const sapBtpOfferings = await fetchServiceOfferings(
                    connection.apiBaseUrl,
                    token,
                    "sapbtp"
                );

                const cloudFoundryOfferings = await fetchServiceOfferings(
                    connection.apiBaseUrl,
                    token,
                    "cloudfoundry"
                );

                const offerings = [
                    ...sapBtpOfferings,
                    ...cloudFoundryOfferings
                ];

                const instances = await fetchServiceInstances(
                    connection.apiBaseUrl,
                    token
                );

                const offeringMap = new Map();
                const planMap = new Map();

                for (const offering of offerings) {
                    offeringMap.set(offering.id, offering);
                }

                for (const plan of plans) {
                    planMap.set(plan.id, plan);
                }

                const cfConnection = await SELECT.one.from(BTPConnection).where({subaccountId:connection.subaccountId,serviceType:"CLOUD_FOUNDRY",active:true});
                
                const userGuids =[...new Set(instances.items.map(instance=>instance.created_by).filter(Boolean))];

                const userMap = new Map();
                if(cfConnection && userGuids.length > 0){
                    const cfToken = await cfAuth.getToken(cfConnection);
                    const users = await fetchUsers(cfConnection,cfToken,userGuids);
                    for(const user of users){
                        userMap.set(user.guid,user);
                    }
                }

                const currentInstanceIds = new Set();

                for (const instance of instances.items) {
                    currentInstanceIds.add(instance.id);
                    const plan = planMap.get(instance.service_plan_id);

                    if (!plan) continue;

                    const offering =
                        offeringMap.get(plan.service_offering_id);

                    if (!offering) continue;
                    const creator = userMap.get(instance.created_by);
                    const createdBy = creator?.username || instance.created_by;

                    const existing = await SELECT.one
                        .from(ServiceAuditReport)
                        .where({
                            subaccountId: connection.subaccountId,
                            serviceInstanceId: instance.id
                        });

                    const entry = {

                        system: "SAP BTP",
                        instance: instance.name,
                        serviceInstanceId: instance.id,
                        subaccountId: connection.subaccountId,
                        subaccount: instance.context.subdomain,

                        serviceName: offering.name,

                        planName: plan.name,

                        status: instance.ready ? "ACTIVE" : "NOT NOTACTIVE",

                        createdOn: new Date(instance.created_at),

                        changedOn: new Date(instance.updated_at),

                        createdBy: createdBy,

                    };

                    if (!existing) {

                        await INSERT
                            .into(ServiceAuditReport)
                            .entries(entry);


                    } else {

                        await UPDATE(ServiceAuditReport)
                            .set(entry)
                            .where({
                                ID: existing.ID
                            });


                    }
                }
                const existingRecords = await SELECT.from(ServiceAuditReport).columns("ID", "serviceInstanceId").where({
                    subaccountId: connection.subaccountId
                })
              
                for (const record of existingRecords) {
                    if (
                        !currentInstanceIds.has(
                            record.serviceInstanceId
                        )
                    ) {

                        await DELETE
                            .from(ServiceAuditReport)
                            .where({
                                ID: record.ID
                            });
                    }
                }
            }

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: new Date(),
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    message: "Synchronization completed"
                })
                .where({
                    reportName: "SERVICE_AUDIT"
                });

            return "Synchronization completed";

        } catch (err) {

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: new Date(),
                    lastSyncStatus: "FAILED",
                    isRunning: false,
                    message: err.message
                })
                .where({
                    reportName: "SERVICE_AUDIT"
                });

            throw err;
        }

    });

    // Sync Role Logs
    this.on("syncRoleLogs", async () => {

        let syncStatus = await SELECT.one.from(ReportSyncStatus).where({ reportName: "ROLE_AUDIT" });
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        if (!syncStatus) {
            await INSERT.into(ReportSyncStatus).entries({
                reportName: "ROLE_AUDIT",
                lastSyncStatus: "RUNNING",
                isRunning: true,
                lastSyncAt: formatAuditTimestamp(oneMonthAgo),
            });
        }
        else {
            await UPDATE(ReportSyncStatus)
                .set({
                    isRunning: true,
                    lastSyncStatus: "RUNNING"
                })
                .where({
                    reportName: "ROLE_AUDIT"
                });
        }
        try {
            const connections = await SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "AUDIT_LOG",
                    active: true
                });
            const entries = [];
            const timeTo = formatAuditTimestamp(new Date());
            const timeFrom =
                syncStatus?.lastSyncAt
                    ? formatAuditTimestamp(syncStatus.lastSyncAt)
                    : formatAuditTimestamp("1970-01-01T00:00:00Z");

            console.log(`Syncing from ${timeFrom} to ${timeTo}`);

            for (const connection of connections) {
                const token = await authServiceManager.getToken(connection);
                const roleLogs = await fetchRoleLogs(connection.apiBaseUrl, token, timeFrom, timeTo);


                for (const log of roleLogs) {
                    const message =
                        typeof log.message === "string"
                            ? JSON.parse(log.message)
                            : log.message;
                    if (
                        !message ||
                        !message.object ||
                        !message.object.id
                    ) {
                        continue;
                    }

                    const obj = message.object.id;
                    let entry = null;
                    const changedByUserId = log.user
                        ? log.user.split("/").pop()
                        : "";

                    // Role Collection Created
                    if (
                        obj.tableName === "xsrolecollections" &&
                        obj.crudType === "CREATE"
                    ) {

                        entry = {

                            system: "BTP",

                            roleCollection: obj.name,

                            event: "Create",

                            timestamp: message.time,

                            changedByUserId: changedByUserId,

                            userRole: "",

                            fieldChanged: "Role Collection",

                            oldValue: "Not Exists",

                            newValue: obj.name,

                            status: message.success ? "Success" : "Failure",

                            subaccountName: connection.subaccountName

                        };

                    }

                    // Role Collection Deleted
                    else if (
                        obj.tableName === "xsrolecollections" &&
                        obj.crudType === "DELETE"
                    ) {

                        entry = {

                            system: "BTP",

                            roleCollection: obj.name,

                            event: "Delete",

                            timestamp: message.time,

                            changedByUserId: changedByUserId,

                            userRole: "",

                            fieldChanged: "Role Collection",

                            oldValue: obj.name,

                            newValue: "Deleted",

                            status: message.success ? "Success" : "Failure",

                            subaccountName: connection.subaccountName

                        };

                    }

                    // Role Assigned
                    else if (
                        obj.tableName === "xsrolecollection2role" &&
                        obj.crudType === "CREATE"
                    ) {

                        entry = {

                            system: "BTP",

                            roleCollection: obj.rolecollection_name,

                            event: "Assign",

                            timestamp: message.time,

                            changedByUserId: changedByUserId,

                            userRole: "",

                            fieldChanged: "Role Assignment",

                            oldValue: "Not Assigned",

                            newValue: `Assigned (${obj.role_name})`,

                            status: message.success ? "Success" : "Failure",

                            subaccountName: connection.subaccountName

                        };

                    }

                    // Role Removed
                    else if (
                        obj.tableName === "xsrolecollection2role" &&
                        obj.crudType === "DELETE"
                    ) {

                        entry = {

                            system: "BTP",

                            roleCollection: obj.rolecollection_name,

                            event: "Remove",

                            timestamp: message.time,

                            changedByUserId: changedByUserId,

                            userRole: "",

                            fieldChanged: "Role Assignment",

                            oldValue: `Assigned (${obj.role_name})`,

                            newValue: "Not Assigned",

                            status: message.success ? "Success" : "Failure",

                            subaccountName: connection.subaccountName

                        };

                    }
                    // Role Collection Updated
                    else if (
                        obj.tableName === "xsrolecollections" &&
                        obj.crudType === "UPDATE"
                    ) {

                        for (const attr of message.attributes || []) {

                            // Skip unchanged fields
                            if (attr.old === attr.new) {
                                continue;
                            }

                            entries.push({

                                system: "BTP",

                                roleCollection: obj.name,

                                event: "Update",

                                timestamp: message.time,

                                changedByUserId: changedByUserId,

                                userRole: "",

                                fieldChanged: attr.name,

                                oldValue: attr.old || "",

                                newValue: attr.new || "",

                                status: message.success ? "Success" : "Failure",

                                subaccountName: connection.subaccountName

                            });
                           
                        }

                        continue;
                    }

                    if (entry) {
                        entries.push(entry);
                    }
                }
            }

            if (entries.length > 0) {
                await INSERT.into(RoleAuditReport).entries(entries);
            }

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: timeTo,
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    message: "Synchronization completed"
                })
                .where({
                    reportName: "ROLE_AUDIT"
                });

            return "Synchronization completed";

        } catch (err) {

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: new Date(),
                    lastSyncStatus: "FAILED",
                    isRunning: false,
                    message: err.message
                })
                .where({
                    reportName: "ROLE_AUDIT"
                });

            throw err;
        }
    })


    this.on("clearEntitlements", async () => {
        await DELETE.from(ServiceAuditReport);
        return "All ServiceAuditReport records deleted";
    });
    this.on("getServiceAuditStatus", async () => {

        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "SERVICE_AUDIT"
            });

    });
     this.on("getRoleAudiStatus", async () => {

        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "ROLE_AUDIT"
            });

    });
     this.on("getConfigurationAuditStatus", async () => {

        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "CONFIGURATION"
            });

    });
    // this.on("syncAuditLogs",async ()=>{
    //     const logs = await audit.fetchAuditLogs();
    //     await db.insert(UserAuditReport).enteries(logs);
    //     return "SUCCESSS";
    // })

    this.after("READ", "ConfigurationReports", (results) => {
        if (!results) return;

        const items = Array.isArray(results) ? results : [results];

        for (const item of items) {
            if (item.userRole === "App_Dev") {
                item.roleCriticality = 2;
            } else {
                item.roleCriticality = 0;
            }
        }
    });
    
    this.on("syncUserAuditLogs", async () => {

    try {

        console.log("=================================================");
        console.log("Starting User Audit Log synchronization...");
        console.log("=================================================");

        // ---------------------------------------------------------
        // 1. Get Audit Log Management token
        // ---------------------------------------------------------

        const token = await authCsm.getToken();

        console.log("Audit Log token received");


        // ---------------------------------------------------------
        // 2. Fetch already correctly mapped audit logs
        // ---------------------------------------------------------

        const entries = await fetchUserAuditLogs(token);

        console.log(
            `Fetched ${entries.length} mapped audit log records`
        );


        if (!entries || entries.length === 0) {

            console.log("No audit logs found");

            return "No audit logs found";
        }


        // ---------------------------------------------------------
        // 3. Debug first 5 records
        // ---------------------------------------------------------

        entries.slice(0, 5).forEach((entry, index) => {

            console.log(
                `Final User Audit Record ${index + 1}:`,
                JSON.stringify(entry, null, 2)
            );

        });


        // ---------------------------------------------------------
        // 4. Delete existing records
        // ---------------------------------------------------------

        await DELETE.from(UserAuditReport);

        console.log(
            "Existing UserAuditReport records deleted"
        );


        // ---------------------------------------------------------
        // 5. Insert records into HANA
        // ---------------------------------------------------------

        await INSERT
            .into(UserAuditReport)
            .entries(entries);


        console.log(
            `${entries.length} User Audit records inserted into HANA`
        );


        // ---------------------------------------------------------
        // 6. Return success
        // ---------------------------------------------------------

        return `${entries.length} Audit logs synchronized successfully`;


    } catch (err) {

        console.error(
            "User Audit Log synchronization failed:",
            err
        );

        throw err;
    }

});

this.on("syncConfigurationAuditLogs", async () => {

    try {

        console.log("=================================================");
        console.log("Starting Configuration Audit Log synchronization...");
        console.log("=================================================");


        // ---------------------------------------------------------
        // 1. Get Audit Log Management token
        // ---------------------------------------------------------

        const token =
            await authCsm.getToken();

        console.log(
            "Audit Log token received"
        );


        // ---------------------------------------------------------
        // 2. Fetch and map Configuration Audit Logs
        // ---------------------------------------------------------

        const entries =
            await fetchConfigurationAuditLogs(token);

        console.log(
            `Fetched ${entries.length} mapped configuration audit records`
        );


        // ---------------------------------------------------------
        // 3. No records
        // ---------------------------------------------------------

        if (
            !entries ||
            entries.length === 0
        ) {

            console.log(
                "No configuration audit logs found"
            );

            return "No configuration audit logs found";

        }


        // ---------------------------------------------------------
        // 4. Debug first 5 records
        // ---------------------------------------------------------

        entries
            .slice(0, 5)
            .forEach(
                (entry, index) => {

                    console.log(
                        `Final Configuration Audit Record ${index + 1}:`,
                        JSON.stringify(
                            entry,
                            null,
                            2
                        )
                    );

                }
            );


        // ---------------------------------------------------------
        // 5. Delete old ConfigurationReport records
        // ---------------------------------------------------------

        await DELETE
            .from(ConfigurationReport);

        console.log(
            "Existing ConfigurationReport records deleted"
        );


        // ---------------------------------------------------------
        // 6. Insert new records
        // ---------------------------------------------------------

        await INSERT
            .into(ConfigurationReport)
            .entries(entries);

        console.log(
            `${entries.length} Configuration Audit records inserted into HANA`
        );


        // ---------------------------------------------------------
        // 7. Return success
        // ---------------------------------------------------------

        return `${entries.length} Configuration Audit logs synchronized successfully`;


    } catch (err) {

        console.error(
            "Configuration Audit Log synchronization failed:",
            err
        );

        throw err;

    }

});

});

