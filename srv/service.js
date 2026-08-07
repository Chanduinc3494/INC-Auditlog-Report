const cds = require("@sap/cds");
const audit = require("../lib/auditLog");
const authCsm = require("../lib/authCms");

const { fetchEntitlementsLogs, fetchAccountDirectory } = require("../lib/cloudservice");
const authServiceManager = require("../lib/authServiceMgr");
const { fetchServiceInstances, fetchServiceOfferings, fetchServicePlans } = require("../lib/serviceAuditfns")
const { SELECT } = require("@sap/cds/lib/ql/cds-ql");
const { fetchRoleLogs } = require("../lib/roleAuditFunction");
const { formatAuditTimestamp } = require("../lib/utils")
module.exports = cds.service.impl(async function () {
    const db = await cds.connect.to("db");
    const {
        UserAuditReport,
        ServiceAuditReport,
        BTPConnection,
        ReportSyncStatus,
        RoleAuditReport
    } = db.entities;

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

        let totalRecords = 0;

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

                for (const instance of instances.items) {

                    const plan = planMap.get(instance.service_plan_id);

                    if (!plan) continue;

                    const offering =
                        offeringMap.get(plan.service_offering_id);

                    if (!offering) continue;

                    const existing = await SELECT.one
                        .from(ServiceAuditReport)
                        .where({
                            subaccount: instance.context.subdomain,
                            serviceName: offering.name,
                            planName: plan.name,
                            instance: instance.name,
                        });

                    const entry = {

                        system: "SAP BTP",
                        instance: instance.name,

                        subaccount: instance.context.subdomain,

                        serviceName: offering.name,

                        planName: plan.name,

                        status: instance.ready ? "ACTIVE" : "NOT NOTACTIVE",

                        createdOn: new Date(instance.created_at),

                        changedOn: new Date(instance.updated_at),

                        createdBy: instance.created_by,

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
            }

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: new Date(),
                    lastSyncStatus: "SUCCESS",
                    recordsSynced: totalRecords,
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

        let totalRecords = 0;

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

                            totalRecords++;
                        }

                        continue;
                    }

                    if (entry) {
                        entries.push(entry);
                        totalRecords++;
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
                    recordsSynced: totalRecords,
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
        await DELETE.from(RoleAuditReport);
        return "All ServiceAuditReport records deleted";
    });
    this.on("getServiceAuditStatus", async () => {

        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "SERVICE_AUDIT"
            });

    });
    // this.on("syncAuditLogs",async ()=>{
    //     const logs = await audit.fetchAuditLogs();
    //     await db.insert(UserAuditReport).enteries(logs);
    //     return "SUCCESSS";
    // })

});
