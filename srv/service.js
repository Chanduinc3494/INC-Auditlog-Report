const cds = require("@sap/cds");
const oAuthManager = require("./lib/oAuthToken");
const { fetchServiceInstances, fetchServiceOfferings, fetchServicePlans } = require("./lib/serviceAuditfns")
const { SELECT,
    INSERT,
    UPDATE,
    DELETE
} = require("@sap/cds/lib/ql/cds-ql");
const { fetchRoleLogs } = require("./lib/roleAuditFunction");
const { formatAuditTimestamp } = require("./lib/utils");
const { fetchUsers } = require("./lib/cfUserApi");
const {fetchUserAuditLogs} = require("./lib/userAuditfns")
const { fetchConfigurationAuditLogs, mapConfigurationAuditLog } = require("./lib/configurationAuditFns");
const cfAuth = require("./lib/cfAuth");
const { indexof } = require("@cap-js/hana/lib/cql-functions");
const { fetchSubaccount } = require("./lib/subaccountApi");
const { getErrorMessage } = require("./lib/errorMessage");

module.exports = cds.service.impl(async function () {
    const db = await cds.connect.to("db");
    const {
        UserAuditReport,
        ServiceAuditReport,
        BTPConnection,
        ReportSyncStatus,
        RoleAuditReport,
        ConfigurationReport
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

                const token = await oAuthManager.getToken(connection);


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

                const cfConnection = await SELECT.one.from(BTPConnection).where({ subaccountId: connection.subaccountId, serviceType: "CLOUD_FOUNDRY", active: true });

                const userGuids = [...new Set(instances.items.map(instance => instance.created_by).filter(Boolean))];

                const userMap = new Map();
                if (cfConnection && userGuids.length > 0) {
                    const cfToken = await cfAuth.getToken(cfConnection);
                    const users = await fetchUsers(cfConnection, cfToken, userGuids);
                    for (const user of users) {
                        userMap.set(user.guid, user);
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
                    lastRunAt: new Date(),
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    message: "Synchronization completed"
                })
                .where({
                    reportName: "SERVICE_AUDIT"
                });

            return "Synchronization completed";

        } catch (err) {

            const errorMessage = getErrorMessage(err);

            await UPDATE(ReportSyncStatus)
                .set({
                    lastRunAt: new Date(),
                    lastSyncStatus: "FAILED",
                    isRunning: false,
                    message: errorMessage
                })
                .where({
                    reportName: "SERVICE_AUDIT"
                });

            throw new Error(errorMessage);
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
            const subaccountIds = [
                ...new Set(
                    connections
                        .map(connection => connection.subaccountId)
                        .filter(Boolean)
                )
            ];

            const accountsConnection = await SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                });

            let subaccountMap = new Map();


            for (const subaccountId of subaccountIds) {
                subaccountMap.set(
                    subaccountId,
                    subaccountId
                );
            }

            if (accountsConnection) {

                try {

                    const accountsToken =
                        await oAuthManager.getToken(
                            accountsConnection
                        );

                    const fetchedMap =
                        await fetchSubaccount(
                            accountsConnection.apiBaseUrl,
                            accountsToken,
                            subaccountIds
                        );

                    // Replace fallback map with actual values
                    for (const [subaccountId, subaccountDetails] of fetchedMap) {
                        subaccountMap.set(
                            subaccountId,
                            subaccountDetails.subdomain
                        );
                    }

                } catch (err) {

                    console.warn(
                        "Could not fetch subaccount names. Using subaccount IDs instead.",
                        err.message
                    );
                }
            }
            const entries = [];
            const timeTo = formatAuditTimestamp(new Date());
            const timeFrom =
                syncStatus?.lastSyncAt
                    ? formatAuditTimestamp(syncStatus.lastSyncAt)
                    : formatAuditTimestamp("1970-01-01T00:00:00Z");

            console.log(`Syncing from ${timeFrom} to ${timeTo}`);

            for (const connection of connections) {
                const subaccountName = subaccountMap.get(connection.subaccountId) || connection.subaccountId;
                const token = await oAuthManager.getToken(connection);
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
                            messageId: log.message_uuid,
                            roleCollection: obj.name,

                            event: "Create",

                            timestamp: message.time,

                            changedByUserId: changedByUserId,

                            userRole: "",

                            fieldChanged: "Role Collection",

                            oldValue: "Not Exists",

                            newValue: obj.name,

                            status: message.success ? "Success" : "Failure",

                            subaccountName: subaccountName

                        };

                    }

                    // Role Collection Deleted
                    else if (
                        obj.tableName === "xsrolecollections" &&
                        obj.crudType === "DELETE"
                    ) {

                        entry = {

                            system: "BTP",
                            messageId: log.message_uuid,
                            roleCollection: obj.name,

                            event: "Delete",

                            timestamp: message.time,

                            changedByUserId: changedByUserId,

                            userRole: "",

                            fieldChanged: "Role Collection",

                            oldValue: obj.name,

                            newValue: "Deleted",

                            status: message.success ? "Success" : "Failure",

                            subaccountName: subaccountName

                        };

                    }

                    // Role Assigned
                    else if (
                        obj.tableName === "xsrolecollection2role" &&
                        obj.crudType === "CREATE"
                    ) {

                        entry = {

                            system: "BTP",
                            messageId: log.message_uuid,
                            roleCollection: obj.rolecollection_name,

                            event: "Assign",

                            timestamp: message.time,

                            changedByUserId: changedByUserId,

                            userRole: "",

                            fieldChanged: "Role Assignment",

                            oldValue: "Not Assigned",

                            newValue: `Assigned (${obj.role_name})`,

                            status: message.success ? "Success" : "Failure",

                            subaccountName: subaccountName

                        };

                    }

                    // Role Removed
                    else if (
                        obj.tableName === "xsrolecollection2role" &&
                        obj.crudType === "DELETE"
                    ) {

                        entry = {

                            system: "BTP",
                            messageId: log.message_uuid,
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
                                messageId: log.message_uuid,
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
                    lastRunAt: timeTo,
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    message: "Synchronization completed"
                })
                .where({
                    reportName: "ROLE_AUDIT"
                });

            return "Synchronization completed";

        } catch (err) {
            const errorMessage = getErrorMessage(err);
            await UPDATE(ReportSyncStatus)
                .set({
                    lastRunAt: new Date(),
                    lastSyncStatus: "FAILED",
                    isRunning: false,
                    message: errorMessage
                })
                .where({
                    reportName: "ROLE_AUDIT"
                });

            throw new Error(errorMessage);
        }
    })


    this.on("clearEntitlements", async () => {
        await DELETE.from(UserAuditReport);
        return "All ServiceAuditReport records deleted";
    });

    // this.on("syncAuditLogs",async ()=>{
    //     const logs = await audit.fetchAuditLogs();
    //     await db.insert(UserAuditReport).enteries(logs);
    //     return "SUCCESSS";
    // })

    this.on("syncConfigurationAuditLogs", async () => {
        let syncStatus = await SELECT.one
            .from(ReportSyncStatus)
            .where({ reportName: "CONFIGURATION" });

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        if (!syncStatus) {
            await INSERT.into(ReportSyncStatus).entries({
                reportName: "CONFIGURATION",
                lastSyncStatus: "RUNNING",
                isRunning: true
            });
        } else {
            await UPDATE(ReportSyncStatus)
                .set({
                    isRunning: true,
                    lastSyncStatus: "RUNNING"
                })
                .where({ reportName: "CONFIGURATION" });
        }

        try {
            const connections = await SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "AUDIT_LOG",
                    active: true
                });

            if (!connections || connections.length === 0) {
                await UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncStatus: "SUCCESS",
                        isRunning: false,
                        lastRunAt: formatAuditTimestamp(new Date()),
                        message: "No active Audit Log connections found."
                    })
                    .where({ reportName: "CONFIGURATION_AUDIT" });

                return "No active Audit Log connections found";
            }

            const subaccountIds = [
                ...new Set(
                    connections
                        //.map(connection => connection.subaccountId)
                        .map(connection => connection.subaccountId?.trim())
                        .filter(Boolean)
                )
            ];

            const accountsConnection = await SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                });

            let subaccountMap = new Map();


          //  for (const subaccountId of subaccountIds) {
             //   subaccountMap.set(
                 ////   subaccountId,
               //     subaccountId
             //   );
           // }

            for (const subaccountId of subaccountIds) {
            const cleanId = subaccountId?.trim();

            if (cleanId) {
            subaccountMap.set(cleanId, cleanId);
            }       
}

            if (accountsConnection) {

                try {

                    const accountsToken =
                        await oAuthManager.getToken(
                            accountsConnection
                        );

                    const fetchedMap =
                        await fetchSubaccount(
                            accountsConnection.apiBaseUrl,
                            accountsToken,
                            subaccountIds
                        );

                    // Replace fallback map with actual values
                   /// for (const [subaccountId, subaccountDetails] of fetchedMap) {
                       // subaccountMap.set(
                         //   subaccountId,
                           // subaccountDetails
                        //);
                    //}

                    for (const [subaccountId, subaccountDetails] of fetchedMap) {

                    const cleanId = subaccountId?.trim();

                    if (cleanId) {
                        subaccountMap.set(
                            cleanId,
                            subaccountDetails
                        );
                    }
                }

                } catch (err) {

                    console.warn(
                        "Could not fetch subaccount names. Using subaccount IDs instead.",
                        err.message
                    );
                }
            }

            const timeTo = formatAuditTimestamp(new Date());
            const timeFrom = syncStatus?.lastSyncAt
                ? formatAuditTimestamp(syncStatus.lastSyncAt)
                : formatAuditTimestamp("1970-01-01T00:00:00Z");

            const entries = [];

            for (const connection of connections) {

    const subaccountId = connection.subaccountId?.trim();

    const subaccountDetails = subaccountMap.get(subaccountId);

    console.log("subaccountId:", subaccountId);
    console.log("subaccountDetails:", subaccountDetails);

    const subaccountName =
        subaccountDetails?.subdomain?.trim() ||
        subaccountId;

    const region =
        subaccountDetails?.region?.trim() || null;

    const token = await oAuthManager.getToken(connection);

    if (!token) {
        continue;
    }

    try {
        const configurationLogs =
            await fetchConfigurationAuditLogs(
                connection.apiBaseUrl,
                token,
                timeFrom,
                timeTo
            );

        for (const log of configurationLogs || []) {

            const mappedEntries = mapConfigurationAuditLog(log);

            for (const entry of mappedEntries) {

                entry.subAccount = subaccountName;
                entry.region = region;

                entries.push(entry);
            }
        }

    } catch (connectionError) {

        console.error(
            `Failed to fetch configuration audit logs for ${subaccountName}:`,
            connectionError.message
        );

        continue;
    }
}

            if (entries.length > 0) {
                console.log("ggs", entries.length);

                await INSERT
                    .into(ConfigurationReport)
                    .entries(entries);
            }

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: timeTo,
                    lastRunAt: timeTo,
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    message:
                        `Synchronization completed. ${entries.length} Configuration Audit records processed.`
                })
                .where({ reportName: "CONFIGURATION" });

            return `Synchronization completed. ${entries.length} Configuration Audit records processed.`;

        } catch (err) {
            await UPDATE(ReportSyncStatus)
                .set({
                    lastRunAt: formatAuditTimestamp(new Date()),
                    lastSyncStatus: "FAILED",
                    isRunning: false,
                    message: err.message
                })
                .where({ reportName: "CONFIGURATION" });

            throw err;
        }
    });

    //user report sync
    // user report sync
this.on("syncUserAuditLogs", async () => {

    let syncStatus = await SELECT.one
        .from(ReportSyncStatus)
        .where({ reportName: "USER_AUDIT" });

    // Create / mark sync as RUNNING
    if (!syncStatus) {

        await INSERT.into(ReportSyncStatus).entries({
            reportName: "USER_AUDIT",
            lastSyncStatus: "RUNNING",
            isRunning: true
        });

    } else {

        await UPDATE(ReportSyncStatus)
            .set({
                isRunning: true,
                lastSyncStatus: "RUNNING"
            })
            .where({
                reportName: "USER_AUDIT"
            });
    }

    try {

        const connections = await SELECT
            .from(BTPConnection)
            .where({
                serviceType: "AUDIT_LOG",
                active: true
            });

        // No active connections
        if (!connections || connections.length === 0) {

            await UPDATE(ReportSyncStatus)
                .set({
                    lastRunAt: formatAuditTimestamp(new Date()),
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    message: "No active Audit Log connections found."
                })
                .where({
                    reportName: "USER_AUDIT"
                });

            return "No active Audit Log connections found";
        }

        /*
         * Fetch only logs since the previous successful sync.
         * First run starts from 1970.
         */
        // const subaccountIds = [
           // ...new Set(
                //connections
                   // .map(connection => connection.subaccountId)
                    //.filter(Boolean)
            //)
        //];

                const subaccountIds = [
            ...new Set(
                connections
                    .map(connection => connection.subaccountId?.trim())
                    .filter(Boolean)
            )
        ];


        const accountsConnection = await SELECT.one
            .from(BTPConnection)
            .where({
                serviceType: "ACCOUNTS",
                active: true
            });
            let subaccountMap = new Map();
 
       // for (const subaccountId of subaccountIds) {
 
           // subaccountMap.set(
               // subaccountId,
               // subaccountId
           // );
       // }

        for (const subaccountId of subaccountIds) {
        const cleanId = subaccountId?.trim();

        if (cleanId) {
            subaccountMap.set(cleanId, cleanId);
        }
}
          if (accountsConnection) {
 
            try {
 
                const accountsToken =
                    await oAuthManager.getToken(
                        accountsConnection
                    );
 
                const fetchedMap =
                    await fetchSubaccount(
                        accountsConnection.apiBaseUrl,
                        accountsToken,
                        subaccountIds
                    );
 
                // Replace fallback ID with actual name
                // for (const [
                //     subaccountId,
                //     subaccountDetails
                // ] of fetchedMap) {
 
                //     subaccountMap.set(
                //         subaccountId,
                //         subaccountDetails.subdomain
                //     );
                // }


        for (const [subaccountId, subaccountDetails] of fetchedMap) {

            const cleanId = subaccountId?.trim();
            console.log(
        "subaccountId:",
        cleanId,
        "subaccountDetails:",
        subaccountDetails
    );

            if (cleanId) {
                subaccountMap.set(
                    cleanId,
                    subaccountDetails?.subdomain?.trim() || cleanId
                );
            }
        }

 
            } catch (err) {
 
                console.warn(
                    "Could not fetch subaccount names. Using subaccount IDs instead.",
                    err.message
                );
            }
        }

        const timeFrom = syncStatus?.lastSyncAt
            ? formatAuditTimestamp(syncStatus.lastSyncAt)
            : formatAuditTimestamp("1970-01-01T00:00:00Z");

        const timeTo = formatAuditTimestamp(new Date());

        const entries = [];

        for (const connection of connections) {
              const subaccountId =connection.subaccountId?.trim();

              const subaccountName =subaccountMap.get(subaccountId) || subaccountId;
            try {

                const token =
                    await oAuthManager.getToken(connection);

                if (!token) {
                    console.warn(
                        `No token available for ${
                            connection.subaccountName || "Unknown"
                        }`
                    );

                    continue;
                }

                const connectionEntries =
                    await fetchUserAuditLogs(
                        connection,
                        token,
                        timeFrom,
                        timeTo,
                        subaccountName
                    );

               for (const entry of connectionEntries || []) {
 
                    entry.subaccount =
                        subaccountName;
                    entries.push(entry);
                }

            } catch (connectionError) {

                console.error(
                    "-------------------------------------------------"
                );

                console.error(
                    `Failed processing User Audit logs for ${
                        connection.subaccountName || "Unknown"
                    }`
                );

                console.error(
                    connectionError.message
                );

                /*
                 * Continue with other connections instead of
                 * failing the complete synchronization.
                 */
                continue;
            }
        }

        /*
         * No new records
         */
        if (!entries || entries.length === 0) {

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: timeTo,
                    lastRunAt: timeTo,
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    message:
                        "Synchronization completed. No new User Audit records found."
                })
                .where({
                    reportName: "USER_AUDIT"
                });

            // console.log(
            //     "No new User Audit logs found"
            // );

            return "No new User Audit logs found";
        }

        /*
         * Debug: show first 5 records
         */
        // entries.slice(0, 5).forEach((entry, index) => {

        //     console.log(
        //         `Final User Audit Record ${index + 1}:`,
        //         JSON.stringify(entry, null, 2)
        //     );

        // });

        /*
         * Insert new records
         */
        await INSERT
            .into(UserAuditReport)
            .entries(entries);

        // console.log(
        //     `${entries.length} User Audit records inserted into HANA`
        // );

        /*
         * Update sync status
         */
        await UPDATE(ReportSyncStatus)
            .set({
                lastSyncAt: timeTo,
                lastRunAt: timeTo,
                lastSyncStatus: "SUCCESS",
                isRunning: false,
                message:
                    `Synchronization completed. ${entries.length} User Audit records processed.`
            })
            .where({
                reportName: "USER_AUDIT"
            });

        return `${entries.length} User Audit records synchronized successfully`;

        console.log("======================================");
console.log("LAST SYNC FROM DB:", syncStatus?.lastSyncAt);
console.log("TIME FROM:", timeFrom);
console.log("TIME TO:", timeTo);
console.log("CURRENT JS TIME:", new Date().toISOString());
console.log("======================================");

    } catch (err) {

        console.error(
            "User Audit Log synchronization failed:",
            err
        );

        /*
         * Mark synchronization as FAILED
         */
        await UPDATE(ReportSyncStatus)
            .set({
                lastRunAt: formatAuditTimestamp(new Date()),
                lastSyncStatus: "FAILED",
                isRunning: false,
                message: err.message
            })
            .where({
                reportName: "USER_AUDIT"
            });

        throw err;
    }
});

    this.on("scheduledSyncRoleLogs", async (req) => {
        return await this.send("syncRoleLogs", {});
    });
    this.on("scheduledSyncServiceLogs", async (req) => {
        return await this.send("syncServiceLogs", {});
    });
    this.on("scheduledSyncConfigurationLogs", async (req) => {
        return await this.send("syncConfigurationAuditLogs", {});
    });
    this.on("scheduledSyncUserLogs", async (req) => {
        return await this.send("syncUserAuditLogs", {});
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

    this.on("getUserAuditStatus", async () => {
        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "USER_AUDIT"
            });

    });





});
