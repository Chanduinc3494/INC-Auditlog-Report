const cds = require("@sap/cds");
const audit = require("../lib/auditLog");
const authCsm = require("../lib/authCms");

const { fetchEntitlementsLogs, fetchAccountDirectory } = require("../lib/cloudservice");
module.exports = cds.service.impl(async function () {
    const db = await cds.connect.to("db");
    const { UserAuditReport } = cds.entities("audit.db");
    const { ServiceAuditReport } = cds.entities("audit.db");
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

    this.on("syncEntitlements", async (req) => {
        const token = await authCsm.getToken();
        const subaccounts = await fetchAccountDirectory(token);
        for (const subaccount of subaccounts.value) {
            const assignments = await fetchEntitlementsLogs(
                token,
                subaccount.guid
            );
            for (const service of assignments.assignedServices) {

                for (const plan of service.servicePlans) {

                    const existing = await SELECT.one
                        .from(ServiceAuditReport)
                        .where({
                            subaccount: subaccount.displayName,
                            serviceName: service.displayName,
                            planName: plan.displayName
                        });

                    if (!existing) {

                        await INSERT.into(ServiceAuditReport).entries({

                            subaccount: subaccount.displayName,

                            serviceName: service.displayName,

                            planName: plan.displayName,

                            status: plan.assignmentInfo?.[0]?.entityState,

                            createdOn: new Date(plan.assignmentInfo?.[0]?.createdDate),

                            changedOn: new Date(plan.assignmentInfo?.[0]?.modifiedDate)

                        });

                    } else {

                        await UPDATE(ServiceAuditReport)
                            .set({

                                status: plan.assignmentInfo?.[0]?.entityState,

                                changedOn: new Date(plan.assignmentInfo?.[0]?.modifiedDate)

                            })
                            .where({

                                ID: existing.ID

                            });

                    }

                }

            }

        }

        return "Synchronization completed";
    });
    // this.on("syncAuditLogs",async ()=>{
    //     const logs = await audit.fetchAuditLogs();
    //     await db.insert(UserAuditReport).enteries(logs);
    //     return "SUCCESSS";
    // })

});
