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
    // this.on("syncAuditLogs",async ()=>{
    //     const logs = await audit.fetchAuditLogs();
    //     await db.insert(UserAuditReport).enteries(logs);
    //     return "SUCCESSS";
    // })

});
