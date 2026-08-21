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
const { fetchUsers, fetchAllUsers } = require("./lib/cfUserApi");
const { fetchUserAuditLogs, fetchUserConfigLogs,deduplicateUserAuditEntries } = require("./lib/userAuditfns")
const { fetchConfigurationAuditLogs, mapConfigurationAuditLog, deduplicateConfigurationEntries, filterConfigurationEntries } = require("./lib/configurationAuditFns");
const cfAuth = require("./lib/cfAuth");
const { indexof } = require("@cap-js/hana/lib/cql-functions");
const { fetchSubaccount } = require("./lib/subaccountApi");
const { getErrorMessage } = require("./lib/errorMessage");
const { fetchIdentityProviders, fetchIdentityUsers } = require("./lib/identityProviderApi"); // xsuaa apis
const { processUserConfigLog } = require("./lib/ProcessUserConfigLogs")

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


    // =====================service logs===========
    this.on("syncServiceLogs", async (req) => {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        // Fetch sync status
        let syncStatus = await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "SERVICE_AUDIT"
            });

        // Prevent concurrent synchronization
        if (syncStatus?.isRunning) {
            return {
                status: "RUNNING",
                message:
                    "Service synchronization is already running.",
                failures: []
            };
        }

        const isFirstSync = !syncStatus?.lastSyncAt;
        // Mark synchronization as running
        if (!syncStatus) {

            await INSERT
                .into(ReportSyncStatus)
                .entries({
                    reportName: "SERVICE_AUDIT",
                    lastSyncStatus: "RUNNING",
                    isRunning: true
                });

            syncStatus = {
                reportName: "SERVICE_AUDIT",
                lastSyncAt: null,
                isRunning: true
            };

        } else {

            await UPDATE(ReportSyncStatus)
                .set({
                    isRunning: true,
                    lastSyncStatus: "RUNNING"
                })
                .where({
                    reportName: "SERVICE_AUDIT"
                });
        }
        const failedConnections = []; // store all failures 

        try {

            const connections = await SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "SERVICE_MANAGER",
                    active: true
                }); // fetching all the subaccount with their credentails for the service type service manager 

            for (const connection of connections) {
                const subaccountId = connection.subaccountId;
                try {

                    let token;

                    try {
                        token = await oAuthManager.getToken(connection); // generating token for logs

                    } catch (err) {
                        failedConnections.push({
                            api: "SERVICE_MANAGER",
                            operation: "OAUTH",
                            subaccountId: connection.subaccountId,
                            error: err.message
                        });
                        continue;
                    }

                    // service plans
                    let sapBtpPlans = [];
                    let cloudFoundryPlans = [];

                    try {
                        sapBtpPlans =
                            await fetchServicePlans(
                                connection.apiBaseUrl,
                                token,
                                "sapbtp"
                            );

                    } catch (err) {
                        failedConnections.push({
                            api: "SERVICE_MANAGER",
                            operation: "GET_SERVICE_PLANS",
                            environment: "sapbtp",
                            subaccountId: connection.subaccountId,
                            error: err.message
                        });
                    }

                    try {
                        cloudFoundryPlans =
                            await fetchServicePlans(
                                connection.apiBaseUrl,
                                token,
                                "cloudfoundry"
                            );

                    } catch (err) {
                        failedConnections.push({
                            api: "SERVICE_MANAGER",
                            operation: "GET_SERVICE_PLANS",
                            environment: "cloudfoundry",
                            subaccountId: connection.subaccountId,
                            error: err.message
                        });
                    }

                    const plans = [
                        ...sapBtpPlans,
                        ...cloudFoundryPlans
                    ];
                    // service offering
                    let sapBtpOfferings = [];
                    let cloudFoundryOfferings = [];

                    try {

                        sapBtpOfferings =
                            await fetchServiceOfferings(
                                connection.apiBaseUrl,
                                token,
                                "sapbtp"
                            );

                    } catch (err) {
                        failedConnections.push({
                            api: "SERVICE_MANAGER",
                            operation: "GET_SERVICE_OFFERINGS",
                            environment: "sapbtp",
                            subaccountId: connection.subaccountId,
                            error: err.message
                        });
                    }
                    try {
                        cloudFoundryOfferings =
                            await fetchServiceOfferings(
                                connection.apiBaseUrl,
                                token,
                                "cloudfoundry"
                            );

                    } catch (err) {
                        failedConnections.push({
                            api: "SERVICE_MANAGER",
                            operation: "GET_SERVICE_OFFERINGS",
                            environment: "cloudfoundry",
                            subaccountId: connection.subaccountId,
                            error: err.message
                        });
                    }
                    const offerings = [
                        ...sapBtpOfferings,
                        ...cloudFoundryOfferings
                    ];
                    // service instances
                    let instances;
                    try {
                        instances =
                            await fetchServiceInstances(
                                connection.apiBaseUrl,
                                token
                            );

                    } catch (err) {
                        failedConnections.push({
                            api: "SERVICE_MANAGER",
                            operation: "GET_SERVICE_INSTANCES",
                            subaccountId: connection.subaccountId,
                            error: err.message
                        });

                        // Cannot continue processing this subaccount
                        continue;
                    }

                    // doing mapping of service plans and offerings
                    const offeringMap = new Map();
                    const planMap = new Map();

                    for (const offering of offerings) {
                        offeringMap.set(offering.id, offering);
                    }

                    for (const plan of plans) {
                        planMap.set(plan.id, plan);
                    }

                    const cfConnection = await SELECT.one.from(BTPConnection).where({ subaccountId: connection.subaccountId, serviceType: "CLOUD_FOUNDRY", active: true });

                    const userGuids = [
                        ...new Set(
                            (instances.items || [])
                                .map(instance => instance.created_by)
                                .filter(Boolean)
                        )
                    ];

                    const userMap = new Map(); // mapp user data to created by we get in instances
                    if (cfConnection && userGuids.length > 0) {
                        try {
                            const cfToken = await cfAuth.getToken(cfConnection); // generating token for cloud foundry
                            // fetching user from cf
                            const users = await fetchUsers(cfConnection, cfToken, userGuids);
                            for (const user of users) {
                                userMap.set(user.guid, user);
                            }
                        } catch (err) {
                            failedConnections.push({
                                api: "CLOUD_COUNDRY",
                                operation: "GET_USERS",
                                subaccountId: connection.subaccountId,
                                error: err.message
                            })
                        }
                    }

                    const currentInstanceIds = new Set();

                    for (const instance of instances.items || []) {
                        currentInstanceIds.add(instance.id);
                        const createdAt = new Date(instance.created_at);
                        if (isFirstSync && createdAt < threeMonthsAgo) {
                            continue;
                        }
                        const plan = planMap.get(instance.service_plan_id);

                        if (!plan) continue;

                        const offering =
                            offeringMap.get(plan.service_offering_id);

                        if (!offering) continue;
                        const creator = userMap.get(instance.created_by);
                        const createdBy = creator?.username || instance.created_by;
                        // checking if instance already exist in our report
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
                            // add in case it does not exist
                            await INSERT
                                .into(ServiceAuditReport)
                                .entries(entry);


                        } else {
                            // update in case of exist
                            await UPDATE(ServiceAuditReport)
                                .set(entry)
                                .where({
                                    ID: existing.ID
                                });


                        }
                    }
                    // delete the instances which is not there in current instances and older than 3 months
                    const existingRecords = await SELECT.from(ServiceAuditReport).columns("ID", "serviceInstanceId", "createdOn").where({
                        subaccountId: connection.subaccountId
                    })

                    for (const record of existingRecords) {
                        const noLongerExists =
                            !currentInstanceIds.has(record.serviceInstanceId);

                        if (noLongerExists) {
                            await DELETE
                                .from(ServiceAuditReport)
                                .where({
                                    ID: record.ID
                                });
                        }
                    }
                }
                catch (connectionError) {

                    failedConnections.push({
                        api: "SERVICE_MANAGER",
                        operation: "SYNC_SERVICE_DATA",
                        subaccountId,
                        error: connectionError.message
                    });

                    continue;
                }

            }
            const finalSyncStatus =
                failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS";

            const message =
                `Synchronization completed. ` +
                `${failedConnections.length > 0
                    ? `${failedConnections.length} API failure(s) detected.`
                    : "All APIs processed successfully."
                }`;

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: new Date(),
                    lastRunAt: new Date(),
                    lastSyncStatus: finalSyncStatus,
                    isRunning: false,
                    message: message
                })
                .where({
                    reportName: "SERVICE_AUDIT"
                });


            return {
                status: finalSyncStatus,
                message: message,
                failures: failedConnections
            };


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

    //================ Sync Role Logs==================
    this.on("syncRoleLogs", async () => {
        // three month in case of last sync time is empty or null : currently 1 August 2026
        const threeMonthAgo = new Date();
        threeMonthAgo.setMonth(threeMonthAgo.getMonth() - 3);
        try {
            // fetching sync status
            let syncStatus = await SELECT.one.from(ReportSyncStatus).where({ reportName: "ROLE_AUDIT" });
            if (syncStatus?.isRunning) {
                return {
                    status: "RUNNING",
                    message: "Role audit synchronization is already running.",
                    processedRecords: 0,
                    failures: []
                };
            }
            if (!syncStatus) {
                await INSERT.into(ReportSyncStatus).entries({
                    reportName: "ROLE_AUDIT",
                    lastSyncStatus: "RUNNING",
                    isRunning: true,
                    lastSyncAt: formatAuditTimestamp(threeMonthAgo),
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

            const failedConnections = []; // to store failed connections
            // fetching subaccount credentials of type audit logs
            const connections = await SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "AUDIT_LOG",
                    active: true
                });
            // creating array of subaccountId
            const subaccountIds = [
                ...new Set(
                    connections
                        .map(connection => connection.subaccountId)
                        .filter(Boolean)
                )
            ];
            // fetching credentails for subaccount
            const accountsConnection = await SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                });

            let subaccountMap = new Map();// mapping of subaccount Id and subaccount Name


            for (const subaccountId of subaccountIds) {
                subaccountMap.set(
                    subaccountId,
                    subaccountId
                );
            }

            if (accountsConnection) {
                try {
                    // token for subaccounts
                    const accountsToken =
                        await oAuthManager.getToken(
                            accountsConnection
                        );
                    // subaccounts data
                    const {
                        subaccountMap: fetchedMap,
                        failures: accountFailures
                    } =
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
                    failedConnections.push(
                        ...accountFailures || []
                    );
                } catch (err) {
                    failedConnections.push({
                        api: "ACCOUNTS",
                        operation: "OAUTH",
                        subaccountId: null,
                        error: err.message
                    });
                    console.warn(
                        "Could not fetch subaccount names. Using subaccount IDs instead.",
                        err.message
                    );
                }
            }
            const entries = []
            const timeTo = formatAuditTimestamp(new Date());
            const timeFrom =
                syncStatus?.lastSyncAt
                    ? formatAuditTimestamp(syncStatus.lastSyncAt)
                    : formatAuditTimestamp(threeMonthAgo);

            console.log(`Syncing from ${timeFrom} to ${timeTo}`);
            // looping through the subaccount with service type audit log
            for (const connection of connections) {
                const subaccountName = subaccountMap.get(connection.subaccountId) || connection.subaccountId;
                try {
                    // oauth token for log
                    const token = await oAuthManager.getToken(connection);
                    if (!token) {
                        throw new Error(
                            "Audit Log OAuth token was not returned."
                        );
                    }
                    // fetching logs 
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
                                roleCollection: obj.rolecollection_name,

                                event: "Remove",

                                timestamp: message.time,

                                changedByUserId: changedByUserId,

                                userRole: "",

                                fieldChanged: "Role Assignment",

                                oldValue: `Assigned (${obj.role_name})`,

                                newValue: "Not Assigned",

                                status: message.success ? "Success" : "Failure",

                                subaccountName: subaccountName

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

                                    subaccountName: subaccountName

                                });

                            }

                            continue;
                        }

                        if (entry) {
                            entries.push(entry);
                        }
                    }
                } catch (connectionError) {
                    console.error(
                        `Role Audit API failed for subaccount ${connection.subaccountId}:`,
                        connectionError
                    );
                    failedConnections.push({
                        api: "AUDIT_LOG",
                        operation: "GET_ROLE_LOGS",
                        subaccountId:
                            connection.subaccountId,
                        error:
                            connectionError.message
                    });

                    continue;
                }
            }
            if (entries.length > 0) {
                const BATCH_SIZE = 500;

                for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                    const batch = entries.slice(i, i + BATCH_SIZE);

                    await cds.tx(async (tx) => {
                        await tx.run(
                            INSERT.into(RoleAuditReport).entries(batch)
                        );
                    });
                }
            }


            // updating sync status : incase of partial run keep do not change last sync status else change to toTime
            const syncResult =
                failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS";

            const message =
                `Synchronization completed. ` +
                `${entries.length} Role Audit records processed.`;

            await cds.tx(async (tx) => {
                await tx.run(
                    UPDATE(ReportSyncStatus)
                        .set({
                            lastSyncAt:
                                syncResult === "SUCCESS"
                                    ? timeTo
                                    : syncStatus.lastSyncAt,

                            lastRunAt: timeTo,
                            lastSyncStatus: syncResult,
                            isRunning: false,
                            message: message
                        })
                        .where({
                            reportName: "ROLE_AUDIT"
                        })
                );
            });

            return {
                status: syncResult,
                message: message,
                processedRecords: entries.length,
                failures: failedConnections
            };

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

    // for deleting data from report 
    this.on("clearEntitlements", async () => {
        await DELETE.from(UserAuditReport);
        return "All ServiceAuditReport records deleted";
    });

    //========= CONFIGURATION REPORT===================

    this.on("syncConfigurationAuditLogs", async () => {
        try {
            const threeMonthAgo = new Date();
            threeMonthAgo.setMonth(threeMonthAgo.getMonth() - 3);

            //Fetch sync status
            let syncStatus = await SELECT.one
                .from(ReportSyncStatus)
                .where({
                    reportName: "CONFIGURATION"
                });

            if (syncStatus?.isRunning) {
                return {
                    status: "RUNNING",
                    message: "Configuration audit synchronization is already running.",
                    processedRecords: 0,
                    failures: []
                };
            }


            if (!syncStatus) {
                await INSERT
                    .into(ReportSyncStatus)
                    .entries({
                        reportName: "CONFIGURATION",
                        lastSyncStatus: "RUNNING",
                        isRunning: true
                    });


                // for sync status
                syncStatus = {
                    reportName: "CONFIGURATION",
                    lastSyncAt: null
                };

            } else {

                await UPDATE(ReportSyncStatus)
                    .set({
                        isRunning: true,
                        lastSyncStatus: "RUNNING"
                    })
                    .where({
                        reportName: "CONFIGURATION"
                    });
            }

            // Failures
            const failedConnections = [];

            // Fetch active AUDIT_LOG connections
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
                        lastRunAt:
                            formatAuditTimestamp(
                                new Date()
                            ),
                        message:
                            "No active Audit Log connections found."
                    })
                    .where({
                        reportName: "CONFIGURATION"
                    });

                return {
                    status: "SUCCESS",
                    message:
                        "No active Audit Log connections found.",
                    processedRecords: 0,
                    failures: []
                };
            }


            // Get unique subaccounts
            const subaccountIds = [
                ...new Set(
                    connections
                        .map(
                            connection =>
                                connection.subaccountId
                        )
                        .filter(Boolean)
                )
            ];


            //Get ACCOUNTS connection
            const accountsConnection =
                await SELECT.one
                    .from(BTPConnection)
                    .where({
                        serviceType: "ACCOUNTS",
                        active: true
                    });



            // Prepare subaccount map
            const subaccountMap =
                new Map();


            // Fallback values
            for (
                const subaccountId
                of subaccountIds
            ) {

                subaccountMap.set(
                    subaccountId,
                    {
                        subdomain:
                            subaccountId,

                        region:
                            null
                    }
                );
            }


            // Fetch actual subaccount names / regions
            if (accountsConnection) {

                try {

                    const accountsToken =
                        await oAuthManager.getToken(
                            accountsConnection
                        );


                    const {
                        subaccountMap: fetchedMap,
                        failures: accountFailures
                    } = await fetchSubaccount(
                        accountsConnection.apiBaseUrl,
                        accountsToken,
                        subaccountIds
                    );


                    for (
                        const [
                            subaccountId,
                            subaccountDetails
                        ]
                        of fetchedMap
                    ) {

                        subaccountMap.set(
                            subaccountId,
                            subaccountDetails
                        );
                    }


                    failedConnections.push(
                        ...accountFailures
                    );


                } catch (err) {

                    failedConnections.push({
                        api: "ACCOUNTS",
                        operation: "OAUTH",
                        subaccountId:
                            accountsConnection.subaccountId,
                        error: err.message
                    });


                    console.warn(
                        "Could not fetch subaccount names. " +
                        "Using subaccount IDs instead.",
                        err.message
                    );
                }
            }



            // Determine sync window
            const timeTo =
                formatAuditTimestamp(
                    new Date()
                );


            const timeFrom =
                syncStatus?.lastSyncAt
                    ? formatAuditTimestamp(
                        syncStatus.lastSyncAt
                    )
                    : formatAuditTimestamp(
                        threeMonthAgo
                    );


            // ============================================================
            // Collect mapped business-level entries
            // ============================================================

            const entries = [];


            // ============================================================
            // Process every AUDIT_LOG connection
            // ============================================================

            for (
                const connection
                of connections
            ) {

                const subaccountDetails = subaccountMap.get(connection.subaccountId);
                const subaccountName = subaccountDetails?.subdomain || connection.subaccountId;
                const region = subaccountDetails?.region || null;

                // identity provider for trust
                let identityProviderMap = new Map();
                try {
                    const identityProviderCred =
                        await SELECT.one
                            .from(BTPConnection)
                            .where({
                                serviceType: "XSUAA",
                                active: true,
                                subaccountId: connection.subaccountId
                            });

                    // XSUAA connection is optional
                    if (identityProviderCred) {
                        //oauth token for xsuaa apis
                        const token =
                            await oAuthManager.getToken(
                                identityProviderCred
                            );

                        if (token) {

                            const {
                                identityProviderMap:
                                fetchedIdentityProviderMap,
                                failures
                            } = await fetchIdentityProviders(
                                identityProviderCred.apiBaseUrl,
                                token
                            );

                            identityProviderMap =
                                fetchedIdentityProviderMap;

                            failedConnections.push(
                                ...failures
                            );
                        }
                    }

                } catch (err) {

                    // Don't stop the audit sync.
                    // Identity Provider enrichment is optional.
                    failedConnections.push({
                        api: "IDENTITY_PROVIDER",
                        subaccountId: connection.subaccountId,
                        error: err.message
                    });
                }

                // User map for configuration audit logs
                let userMap = new Map();
                try {
                    const cfConnection =
                        await SELECT.one
                            .from(BTPConnection)
                            .where({
                                serviceType: "CLOUD_FOUNDRY",
                                active: true,
                                subaccountId: connection.subaccountId
                            });
                    if (cfConnection) {
                        // Generate CF OAuth token
                        const cfToken =
                            await cfAuth.getToken(
                                cfConnection
                            );

                        if (cfToken) {
                            // Fetch ALL users for this subaccount
                            const users = await fetchAllUsers(
                                cfConnection,
                                cfToken
                            );
                            // user GUID -> username/email
                            for (const user of users) {

                                if (!user?.guid) {
                                    continue;
                                }

                                userMap.set(
                                    user.guid,
                                    user.username ||
                                    user.presentation_name ||
                                    user.guid
                                );
                            }
                        }
                    }
                } catch (err) {
                    failedConnections.push({
                        api: "CLOUD_FOUNDRY",
                        operation: "GET_USERS",
                        subaccountId: connection.subaccountId,
                        error: err.message
                    });
                }

                //===========Configuration Logs=====================
                try {

                    // OAuth token for auth logs
                    const token =
                        await oAuthManager.getToken(
                            connection
                        );


                    if (!token) {
                        throw new Error(
                            "Audit Log OAuth token was not returned."
                        );
                    }


                    // Fetch raw audit logs
                    const configurationLogs =
                        await fetchConfigurationAuditLogs(
                            connection.apiBaseUrl,
                            token,
                            timeFrom,
                            timeTo
                        );


                    // Map raw audit logs
                    for (
                        const log
                        of configurationLogs || []
                    ) {


                        try {

                            const mappedEntries =
                                mapConfigurationAuditLog(
                                    log,
                                    identityProviderMap,
                                    userMap
                                );


                            if (
                                !Array.isArray(
                                    mappedEntries
                                )
                            ) {

                                continue;
                            }


                            for (
                                const entry
                                of mappedEntries
                            ) {

                                // ----------------------------------------
                                // Enrichment from connection
                                // ----------------------------------------

                                entry.subAccount = subaccountName;

                                entry.region = region;

                                entries.push(
                                    entry
                                );
                            }

                        } catch (logError) {

                            failedConnections.push({
                                api:
                                    "AUDIT_LOG_MAPPING",

                                subaccountId:
                                    connection.subaccountId,

                                messageId:
                                    log?.message_uuid,

                                error:
                                    logError.message
                            });


                            continue;
                        }
                    }


                } catch (connectionError) {

                    failedConnections.push({
                        api: "AUDIT_LOG",

                        subaccountId:
                            connection.subaccountId,

                        error:
                            connectionError.message
                    });


                    continue;
                }
            }



            // Deduplicate logical reporting rows
            const filteredEntries =
                filterConfigurationEntries(
                    entries
                );

            const uniqueEntries =
                deduplicateConfigurationEntries(
                    filteredEntries
                );


            // Insert clean business-level records
            if (uniqueEntries.length > 0) {

                const BATCH_SIZE = 500;

                for (
                    let i = 0;
                    i < uniqueEntries.length;
                    i += BATCH_SIZE
                ) {

                    const batch =
                        uniqueEntries.slice(
                            i,
                            i + BATCH_SIZE
                        );


                    await cds.tx(async (tx) => {

                        await tx.run(
                            INSERT
                                .into(ConfigurationReport)
                                .entries(batch)
                        );

                    });
                }
            }



            // Update sync status
            const finalSyncStatus =
                failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS";

            const finalLastSyncAt =
                finalSyncStatus === "SUCCESS"
                    ? timeTo
                    : syncStatus?.lastSyncAt;
            const message =
                `Synchronization completed. ` +
                `${uniqueEntries.length} Configuration Audit records processed.` +
                (
                    failedConnections.length > 0
                        ? ` ${failedConnections.length} API failure(s) detected.`
                        : ""
                );


            await cds.tx(async (tx) => {

                await tx.run(
                    UPDATE(ReportSyncStatus)
                        .set({

                            lastSyncAt:
                                finalLastSyncAt,

                            lastRunAt:
                                timeTo,

                            lastSyncStatus:
                                finalSyncStatus,

                            isRunning:
                                false,

                            message:
                                message
                        })
                        .where({
                            reportName:
                                "CONFIGURATION"
                        })
                );
            });

            // Return result
            return {
                status: finalSyncStatus,
                message: message,
                processedRecords: uniqueEntries.length,
                rawMappedRecords: entries.length,
                failures: failedConnections
            };

        } catch (err) {
            // Global failure
            await UPDATE(ReportSyncStatus)
                .set({
                    lastRunAt:
                        formatAuditTimestamp(
                            new Date()
                        ),

                    lastSyncStatus: "FAILED",

                    isRunning: false,
                    message: err.message
                })
                .where({
                    reportName: "CONFIGURATION"
                });
            throw err;
        }
    });

    //======================user report sync=========
    this.on("syncUserAuditLogs", async () => {
        // get the sync status
        const syncStatus = await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "USER_AUDIT"
            });
        if (syncStatus?.isRunning) {
            return {
                status: "RUNNING",
                message:
                    "User Audit synchronization is already running.",
                failures: []
            };
        }
        const syncStatusId = syncStatus?.ID || cds.utils.uuid();

        await UPSERT.into(ReportSyncStatus).entries({
            ID: syncStatusId,
            reportName: "USER_AUDIT",
            lastSyncStatus: "RUNNING",
            isRunning: true
        });

        try {

            let failedConnections = [];

            const connections = await SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "AUDIT_LOG",
                    active: true
                });

            if (!connections || connections.length === 0) {

                const timeTo = formatAuditTimestamp(new Date());

                await UPSERT.into(ReportSyncStatus).entries({
                    reportName: "USER_AUDIT",
                    lastRunAt: timeTo,
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    ID: syncStatusId,
                    message: "No active Audit Log connections found."
                });

                return "No active Audit Log connections found";
            }

            const subaccountIds = [
                ...new Set(
                    connections
                        .map(connection =>
                            connection.subaccountId?.trim()
                        )
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

                    const {
                        subaccountMap: fetchedMap,
                        failures: accountFailures
                    } = await fetchSubaccount(
                        accountsConnection.apiBaseUrl,
                        accountsToken,
                        subaccountIds
                    );

                    for (const [
                        subaccountId,
                        subaccountDetails
                    ] of fetchedMap) {

                        subaccountMap.set(
                            subaccountId,
                            subaccountDetails.subdomain
                        );
                    }

                    failedConnections.push(
                        ...(accountFailures || [])
                    );

                } catch (err) {

                    failedConnections.push({
                        api: "ACCOUNTS",
                        operation: "OAUTH",
                        subaccountId: null,
                        error: err.message
                    });

                    console.warn(
                        "Could not fetch subaccount names. Using subaccount IDs instead.",
                        err.message
                    );
                }
            }

            const timeFrom = syncStatus?.lastSyncAt
                ? formatAuditTimestamp(syncStatus.lastSyncAt)
                : formatAuditTimestamp(
                    "2026-08-01T00:00:00Z"
                );

            const timeTo = formatAuditTimestamp(new Date());

            const entries = [];

            for (const connection of connections) {

                const cleanSubaccountId = connection.subaccountId?.trim();

                const subaccountName =
                    subaccountMap.get(
                        cleanSubaccountId
                    ) ||
                    cleanSubaccountId;

                //User Mapping
                let userMap = new Map();
                try {

                    const userConnection =
                        await SELECT.one
                            .from(BTPConnection)
                            .where({
                                subaccountId:
                                    connection.subaccountId,
                                serviceType: "XSUAA",
                                active: true
                            });

                    if (!userConnection) {
                        throw new Error(
                            `XSUAA connection not found for subaccount ${connection.subaccountId}`
                        );
                    }

                    const userToken =
                        await oAuthManager.getToken(
                            userConnection
                        );

                    if (!userToken) {
                        throw new Error(
                            "XSUAA OAuth token was not returned."
                        );
                    }

                    const {
                        userMapping,
                        failures: identityFailures
                    } = await fetchIdentityUsers(
                        userConnection.apiBaseUrl,
                        userToken
                    );
                    userMap = userMapping;

                    failedConnections.push(
                        ...(identityFailures || [])
                    );

                } catch (err) {

                    failedConnections.push({
                        api: "IDENTITY_USERS",
                        operation: "GET_IDENTITY_USERS",
                        subaccountId:
                            connection.subaccountId,
                        error:
                            err.message
                    });

                }

                try {

                    const token = await oAuthManager.getToken(connection);

                    if (!token) {

                        throw new Error(
                            "Audit Log OAuth token was not returned."
                        );
                    }
                    const connectionEntries = []
                    const configEnteries =
                        await fetchUserConfigLogs(
                            connection,
                            token,
                            timeFrom,
                            timeTo,
                            userMap
                        );
                    connectionEntries.push(
                        ...(configEnteries || [])
                    );
                    const securityEnteries =
                        await fetchUserAuditLogs(
                            connection,
                            token,
                            timeFrom,
                            timeTo
                        );
                    connectionEntries.push(
                        ...(securityEnteries || [])
                    );
                    for (const entry of connectionEntries || []) {

                        /*
                         * Optional technical-user filtering
                         */
                        const userId = entry.userId?.trim();

                        const normalizedUserId = userId?.toLowerCase();

                        if (
                            !normalizedUserId ||
                            normalizedUserId === "anonymous" ||
                            normalizedUserId === "unknown_user" ||
                            // normalizedUserId.startsWith("sb-") ||
                            normalizedUserId.includes("cn=com.sap.ca.ids")
                        ) {
                            continue;
                        }


                        entry.subaccount =
                            subaccountName;

                        entries.push(entry);
                    }

                } catch (connectionError) {

                    failedConnections.push({
                        api: "AUDIT_LOG",
                        operation: "GET_USER_AUDIT_LOGS",
                        subaccountId: cleanSubaccountId,
                        error: connectionError.message
                    });


                    continue;
                }
            }
            const finalSyncStatus =
                failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS";

            if (!entries || entries.length === 0) {

                const message =
                    failedConnections.length > 0
                        ? `Synchronization completed with ${failedConnections.length} failure(s). No new User Audit records were processed.`
                        : "Synchronization completed. No new User Audit records found.";

                await UPSERT.into(ReportSyncStatus).entries({
                    reportName: "USER_AUDIT",
                    lastRunAt: timeTo,
                    lastSyncStatus: finalSyncStatus,
                    isRunning: false,
                    ID: syncStatusId,
                    message: message
                });

                return {
                    status: finalSyncStatus,
                    message: message,
                    processedRecords: 0,
                    failures: failedConnections
                };
            }

            const ProcessedEnteries = deduplicateUserAuditEntries(entries);

            let processedRecords = 0;

            if (ProcessedEnteries.length > 0) {

                const BATCH_SIZE = 500;

                for (
                    let i = 0;
                    i < ProcessedEnteries.length;
                    i += BATCH_SIZE
                ) {

                    const batch =
                        ProcessedEnteries.slice(
                            i,
                            i + BATCH_SIZE
                        );

                    console.log(
                        `Inserting User Audit batch ` +
                        `${Math.floor(i / BATCH_SIZE) + 1} ` +
                        `(${batch.length} records)...`
                    );

                    /*
                     * Each batch gets its own short-lived
                     * database transaction.
                     */
                    await cds.tx(
                        async tx => {

                            await tx.run(
                                INSERT
                                    .into(UserAuditReport)
                                    .entries(batch)
                            );

                        }
                    );

                    processedRecords += batch.length;

                    console.log(
                        `User Audit batch inserted successfully. ` +
                        `Total processed: ${processedRecords}/${ProcessedEnteries.length}`
                    );
                }
            }


            /*
             * ---------------------------------------------------
             * SYNC STATUS
             * ---------------------------------------------------
             */

            const syncResult =
                failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS";

            const syncMessage =
                `Synchronization completed. ` +
                `${processedRecords} User Audit records processed.` +
                (
                    failedConnections.length > 0
                        ? ` ${failedConnections.length} API failure(s) detected.`
                        : ""
                );


            await cds.tx(
                async tx => {

                    await tx.run(
                        UPDATE(ReportSyncStatus)
                            .set({

                                /*
                                 * Only move lastSyncAt forward when
                                 * the synchronization itself is
                                 * successful.
                                 */
                                lastSyncAt:
                                    syncResult === "SUCCESS"
                                        ? timeTo
                                        : syncStatus.lastSyncAt,

                                lastRunAt:
                                    timeTo,

                                lastSyncStatus:
                                    syncResult,

                                isRunning:
                                    false,

                                message:
                                    syncMessage

                            })
                            .where({
                                ID: syncStatusId
                            })
                    );

                }
            );


            return {

                status:
                    syncResult,

                message:
                    syncMessage,

                processedRecords:
                    processedRecords,

                failures:
                    failedConnections

            };

        } catch (err) {

            console.error(
                "User Audit Log synchronization failed:",
                err
            );

            await cds.tx(
                async tx => {

                    await tx.run(
                        UPDATE(ReportSyncStatus)
                            .set({

                                lastRunAt:
                                    formatAuditTimestamp(
                                        new Date()
                                    ),

                                lastSyncStatus:
                                    "FAILED",

                                isRunning:
                                    false,

                                message:
                                    err.message

                            })
                            .where({
                                ID: syncStatusId
                            })
                    );

                }
            );

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

    //purge data
    this.on("purgeConfigurationData", async (req) => {

        const { fromTimestamp } = req.data;

        const timestamp = new Date(fromTimestamp);

        await DELETE
            .from(UserAuditReport)
            .where({
                timestamp: { ">=": timestamp }
            });

        await UPDATE(ReportSyncStatus)
            .set({
                lastSyncAt: timestamp,
                lastSyncStatus: "PURGED",
                message:
                    `Configuration data purged from ${timestamp.toISOString()}`
            })
            .where({
                reportName: "CONFIGURATION"
            });

        return `Configuration data purged from ${timestamp.toISOString()}`;
    });





});
