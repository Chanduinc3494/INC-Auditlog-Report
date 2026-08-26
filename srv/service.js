const cds = require("@sap/cds");
const oAuthManager = require("./lib/api/oauth/oAuthToken");
const { fetchServiceInstances, fetchServiceOfferings, fetchServicePlans } = require("./lib/api/service/serviceAuditApi")
const { SELECT,
    INSERT,
    UPDATE,
    DELETE
} = require("@sap/cds/lib/ql/cds-ql");
const { fetchRoleLogs } = require("./lib/api/logs/roleAuditApi");
const { formatAuditTimestamp } = require("./lib/helper/utils");
const { fetchUsers, fetchAllUsers } = require("./lib/api/cf/cfUserApi");
const { fetchUserAuditLogs, fetchUserConfigLogs, deduplicateUserAuditEntries } = require("./lib/userAuditfns")

const cfAuth = require("./lib/api/cf/cfAuth");
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

                    // Fetch Plans , Offering and Instances
                    const { plans, offerings, instances, canContinue } = await fetchServiceData(connection, token, failedConnections);
                    if (!canContinue) {
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
                    // Fetch Users for Instance Creators
                    const userMap = await fetchInstanceUsers(connection, instances, failedConnections, cfAuth, fetchUsers, BTPConnection, SELECT);

                    const currentInstanceIds = new Set();

                    for (const instance of instances.items || []) {
                        currentInstanceIds.add(instance.id);
                        const createdAt = new Date(instance.created_at);
                        if (isFirstSync && createdAt < threeMonthsAgo) {
                            continue;
                        }
                        const plan = planMap.get(instance.service_plan_id);

                        if (!plan) continue;

                        const offering = offeringMap.get(plan.service_offering_id);

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
                        const noLongerExists = !currentInstanceIds.has(record.serviceInstanceId);

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



            // fetching credentails for subaccount
            const accountsConnection = await SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                });

            // subaccount mapping
            const subaccountMap = await fetchSubaccountsData({ connections, accountsConnection, oAuthManager, fetchSubaccount, failedConnections });

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
                    // fetch + map Role Audit logs
                    const roleEnteries = await fetchAndMapRoleLogs({ connection, token, timeFrom, timeTo, subaccountName, fetchRoleLogs });
                    entries.push(...roleEnteries);

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

    //========= CONFIGURATION REPORT===================

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
            const failedConnections = [];
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
                    console.error(
                        `Failed to fetch configuration audit logs for ${subaccountName}:`,
                        connectionError.message
                    );
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

            return {
                status: failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS",

                message:
                    `Synchronization completed. ` +
                    `${entries.length} Configuration Audit records processed.`,

                processedRecords: entries.length,

                failures: failedConnections
            };

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
            let failedConnections = [];
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

                    const {
                        subaccountMap: fetchedMap,
                        failures: accountFailures } =
                        await fetchSubaccount(
                            accountsConnection.apiBaseUrl,
                            accountsToken,
                            subaccountIds
                        );

                    // Replace fallback ID with actual name
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
                : formatAuditTimestamp("2026-08-01T00:00:00Z");

        const timeTo =formatAuditTimestamp(new Date());

        const entries = [];

            for (const connection of connections) {
                const subaccountName =
                    subaccountMap.get(
                        connection.subaccountId
                    ) ||
                    connection.subaccountId;
                try {

                    const token =
                        await oAuthManager.getToken(connection);

                    if (!token) {
                        throw new Error(
                            "Audit Log OAuth token was not returned."
                        );

                        continue;
                    }

                    const connectionEntries =
                        await fetchUserAuditLogs(
                            connection,
                            token,
                            timeFrom,
                            timeTo
                        );

                    for (const entry of connectionEntries || []) {

                        entry.subaccount =
                            subaccountName;
                        entries.push(entry);
                    }

            } catch (connectionError) {

                    failedConnections.push({
                        api: "AUDIT_LOG",
                        operation: "GET_USER_AUDIT_LOGS",
                        subaccountId: connection.subaccountId,
                        error: connectionError.message
                    });
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
            const finalSyncStatus =
                failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS";
            if (!entries || entries.length === 0) {

            const message =
                failedConnections.length > 0
                    ? `Synchronization completed with ${failedConnections.length} failure(s). No new User Audit records were processed.`
                    : "Synchronization completed. No new User Audit records found.";

                await UPDATE(ReportSyncStatus)
                    .set({
                        lastRunAt: timeTo,
                        lastSyncStatus: finalSyncStatus,
                        isRunning: false,
                        message: message
                    })
                    .where({
                        reportName: "USER_AUDIT"
                    });

            return {
                status: finalSyncStatus,
                message: message,
                processedRecords: 0,
                failures: failedConnections
            };
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
            const message =
                `Synchronization completed. ` +
                `${entries.length} User Audit records processed.` +
                (
                    failedConnections.length > 0
                        ? ` ${failedConnections.length} API failure(s) detected.`
                        : ""
                );

            await UPDATE(ReportSyncStatus)
                .set({
                    lastSyncAt: timeTo,
                    lastRunAt: timeTo,
                    lastSyncStatus: finalSyncStatus,
                    isRunning: false,
                    message: message
                })
                .where({
                    reportName: "USER_AUDIT"
                });

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

    //===========Job action to Sync Role logs========
    this.on("scheduledSyncRoleLogs", async (req) => {
        return await this.send("syncRoleLogs", {});
    });
    //================Job action to Sync Service Logs========
    this.on("scheduledSyncServiceLogs", async (req) => {
        return await this.send("syncServiceLogs", {});
    });
    //===============Job action to Sync Config logs======
    this.on("scheduledSyncConfigurationLogs", async (req) => {
        return await this.send("syncConfigurationAuditLogs", {});
    });
    //===============Job action to Sync User logs=========
    this.on("scheduledSyncUserLogs", async (req) => {
        return await this.send("syncUserAuditLogs", {});
    });

    //=============Get Service report Status=========
    this.on("getServiceAuditStatus", async () => {

        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "SERVICE_AUDIT"
            });

    });
    //=============Get Role Audit report Status=========
    this.on("getRoleAudiStatus", async () => {

        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "ROLE_AUDIT"
            });

    });
    //=============Get Configuration  report Status=========
    this.on("getConfigurationAuditStatus", async () => {

        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "CONFIGURATION"
            });

    });
    //=============Get User report Status=========
    this.on("getUserAuditStatus", async () => {
        return await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "USER_AUDIT"
            });

    });

    //=====purge data ( add report name , Report type)======
    this.on("purgeConfigurationData", async (req) => {
        const { fromTimestamp } = req.data;
        const timestamp = new Date(fromTimestamp);
        await DELETE
            .from(ConfigurationReport)
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


this.on("testXsuaa", async () => {

    try {

        const credentials =
            getAuditlogXsuaaCredentials();

        console.log(
            "XSUAA service found:",
            "auditlog-xsuaa"
        );

        console.log(
            "XSUAA URL:",
            credentials.apiurl
        );

        const token =
            await getXsuaaToken();

        console.log(
            "XSUAA token received:",
            !!token
        );

        return {
            status: "SUCCESS",
            message:
                "auditlog-xsuaa token successfully obtained"
        };

    } catch (error) {

        console.error(
            "XSUAA TEST ERROR:",
            error.message
        );

        throw error;
    }
});


});
