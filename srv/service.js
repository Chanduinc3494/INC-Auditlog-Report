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

const cfAuth = require("./lib/api/cf/cfAuth");
const { indexof } = require("@cap-js/hana/lib/cql-functions");
const { fetchSubaccount } = require("./lib/api/subaccount/subaccountApi");
const { getErrorMessage } = require("./lib/processing/errorMessage");
const { fetchIdentityProviders } = require("./lib/api/identity/identityProviderApi"); // xsuaa apis


//Configuration Functions
const { fetchInstanceMapForSubaccount } = require("./lib/audit/configurationAudit/instanceData");
const { fetchIdentityProviderMapForSubaccount } = require("./lib/audit/configurationAudit/identityProviderData");
const { fetchUserMapForSubaccount } = require("./lib/audit/configurationAudit/platformUserData");
const { fetchSubaccountMapConfig } = require("./lib/audit/configurationAudit/subaccountData");
const { processUserConfigLog } = require("./lib/audit/configurationAudit/ProcessUserConfigLogs");
const { mapServiceBindingAndKeyAuditLogs } = require("./lib/audit/configurationAudit/serviceBindingandKeysData")
const { fetchConfigurationAuditLogs, mapConfigurationAuditLog, deduplicateConfigurationEntries, filterConfigurationEntries, buildInstanceMap } = require("./lib/audit/configurationAudit/configurationAuditFunctions");
const { fetchServiceBindingAndKeyAuditLogs } = require("./lib/api/cf/CfAudit");

//Service Functions
const { fetchServiceData } = require("./lib/audit/serviceAudit/serviceData");
const { fetchInstanceUsers } = require("./lib/audit/serviceAudit/serviceUsers");

//Role Audit Functions
const { fetchSubaccountsData } = require("./lib/audit/roleAudit/subaccountData");
const { fetchAndMapRoleLogs } = require("./lib/audit/roleAudit/roleAuditData");

// Status helper
const { acquireSyncLock } = require("./lib/helper/StatusHelper");
//User Audit
const {
    fetchUserAuditLogs,
    fetchUserConfigLogs,
    deduplicateUserAuditEntries,
    consolidateUserPersonaRecords
} = require("./lib/audit/userAudit/userAuditfns");
const { fetchIdentityUsers } = require("./lib/api/identity/identityProviderApi");

//jobs
const xsenv = require("@sap/xsenv");
const axios = require("axios");
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
        // Every DB operation in this long-running background job
        // must use this helper so it gets its own short transaction.
        const tenant = req.tenant;
        const run = (query) =>
            cds.tx(
                {
                    tenant,
                    user: cds.User.privileged
                },
                tx => tx.run(query)
            );

        const threeMonthsAgo = new Date(
            Date.now() - 90 * 24 * 60 * 60 * 1000
        ).toISOString();

        //sync status
        const lockResult = await acquireSyncLock({
            reportName: "SERVICE_AUDIT",
            run,
            ReportSyncStatus
        });
        if (!lockResult.acquired) {
            return {
                status: "RUNNING",
                message:
                    "Service synchronization is already running.",
                failures: []
            };
        }

        let syncStatus = lockResult.syncStatus;
        const isFirstSync = lockResult.isFirstSync;

        let firstSyncAt;
        if (isFirstSync) {
            firstSyncAt = threeMonthsAgo;
        } else {
            firstSyncAt = new Date(syncStatus.firstSyncAt);
        }

        const failedConnections = []; // store all failures 

        try {

            const connections = await run(SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "SERVICE_MANAGER",
                    active: true
                })); // fetching all the subaccount with their credentails for the service type service manager 

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
                    const userMap = await fetchInstanceUsers(connection, instances, failedConnections, cfAuth, fetchUsers, BTPConnection, run);

                    const currentInstanceIds = new Set();

                    for (const instance of instances.items || []) {
                        currentInstanceIds.add(instance.id);
                        const createdAt = new Date(instance.created_at);
                        if (isFirstSync && createdAt < threeMonthsAgo) {
                            continue;
                        }
                        else if (firstSyncAt && createdAt < firstSyncAt) {
                            continue;
                        }
                        const plan = planMap.get(instance.service_plan_id);

                        if (!plan) continue;

                        const offering = offeringMap.get(plan.service_offering_id);

                        if (!offering) continue;

                        const creator = userMap.get(instance.created_by);
                        const createdBy = creator?.username || instance.created_by;
                        // checking if instance already exist in our report
                        const existing = await run(SELECT.one
                            .from(ServiceAuditReport)
                            .where({
                                subaccountId: connection.subaccountId,
                                serviceInstanceId: instance.id
                            }));

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
                            await run(INSERT
                                .into(ServiceAuditReport)
                                .entries(entry));


                        } else {
                            // update in case of exist
                            await run(UPDATE(ServiceAuditReport)
                                .set(entry)
                                .where({
                                    ID: existing.ID
                                }));


                        }
                    }
                    // delete the instances which is not there in current instances and older than 3 months
                    const existingRecords = await run(SELECT.from(ServiceAuditReport).columns("ID", "serviceInstanceId", "createdOn").where({
                        subaccountId: connection.subaccountId
                    }));

                    for (const record of existingRecords) {
                        const noLongerExists = !currentInstanceIds.has(record.serviceInstanceId);

                        if (noLongerExists) {
                            await run(DELETE
                                .from(ServiceAuditReport)
                                .where({
                                    ID: record.ID
                                })
                            );
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
            const finalLastSyncAt =
                finalSyncStatus === "SUCCESS"
                    ? new Date()
                    : syncStatus?.lastSyncAt;

            if (isFirstSync) {
                await run(UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncAt: finalLastSyncAt,
                        lastRunAt: new Date(),
                        lastSyncStatus: finalSyncStatus,
                        isRunning: false,
                        runningSince: null,
                        firstSyncAt: firstSyncAt,
                        message: message
                    })
                    .where({
                        reportName: "SERVICE_AUDIT"
                    }));
            }
            else {
                await run(UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncAt: finalLastSyncAt,
                        lastRunAt: new Date(),
                        lastSyncStatus: finalSyncStatus,
                        isRunning: false,
                        runningSince: null,
                        message: message
                    })
                    .where({
                        reportName: "SERVICE_AUDIT"
                    }));
            }



            return {
                status: finalSyncStatus,
                message: message,
                failures: failedConnections
            };


        } catch (err) {

            const errorMessage = getErrorMessage(err);

            await run(UPDATE(ReportSyncStatus)
                .set({
                    lastRunAt: new Date(),
                    lastSyncStatus: "FAILED",
                    isRunning: false,
                    runningSince: null,
                    message: errorMessage
                })
                .where({
                    reportName: "SERVICE_AUDIT"
                }));

            throw new Error(errorMessage);
        }

    });

    //================ Sync Role Logs==================
    this.on("syncRoleLogs", async (req) => {
        // Every DB operation in this long-running background job
        // must use this helper so it gets its own short transaction.
        const tenant = req.tenant;
        const run = (query) =>
            cds.tx(
                {
                    tenant,
                    user: cds.User.privileged
                },
                tx => tx.run(query)
            );
        // three month in case of last sync time is empty or null : currently 1 August 2026
        const threeMonthAgo = new Date(
            Date.now() - 90 * 24 * 60 * 60 * 1000
        ).toISOString();

        try {
            // sync status
            const lockResult = await acquireSyncLock({
                reportName: "ROLE_AUDIT",
                run,
                ReportSyncStatus
            });

            if (!lockResult.acquired) {
                return {
                    status: "RUNNING",
                    message:
                        "Role audit synchronization is already running.",
                    processedRecords: 0,
                    failures: []
                };
            }

            const syncStatus = lockResult.syncStatus;
            const failedConnections = [];

            // fetching subaccount credentials of type audit logs
            const connections = await run(SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "AUDIT_LOG",
                    active: true
                }));

            // fetching credentials for subaccount
            const accountsConnection = await run(SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                }));

            // subaccount mapping
            const subaccountMap =
                await fetchSubaccountsData({
                    connections,
                    accountsConnection,
                    oAuthManager,
                    fetchSubaccount,
                    failedConnections
                });

            const syncStart =
                syncStatus?.lastSyncAt
                    ? new Date(syncStatus.lastSyncAt)
                    : new Date(threeMonthAgo);

            const syncEnd = new Date();

            const CHUNK_DAYS = 10;

            let chunkFrom = new Date(syncStart);
            let totalProcessedRecords = 0;

            console.log(
                `Syncing from ${formatAuditTimestamp(syncStart)} to ${formatAuditTimestamp(syncEnd)}`
            );

            while (chunkFrom < syncEnd) {
                let chunkTo = new Date(chunkFrom);

                chunkTo.setDate(
                    chunkTo.getDate() + CHUNK_DAYS
                );

                if (chunkTo > syncEnd) {
                    chunkTo = new Date(syncEnd);
                }

                const timeFrom =
                    formatAuditTimestamp(chunkFrom);

                const timeTo =
                    formatAuditTimestamp(chunkTo);

                console.log(
                    `[ROLE AUDIT] Processing chunk: ${timeFrom} → ${timeTo}`
                );

                const chunkEntries = [];

                // looping through the subaccount with service type audit log
                for (const connection of connections) {
                    const subaccountName =
                        subaccountMap.get(
                            connection.subaccountId
                        ) ||
                        connection.subaccountId;

                    try {
                        // oauth token for log
                        const token =
                            await oAuthManager.getToken(
                                connection
                            );

                        if (!token) {
                            throw new Error(
                                "Audit Log OAuth token was not returned."
                            );
                        }

                        // fetch + map Role Audit logs
                        const roleEntries =
                            await fetchAndMapRoleLogs({
                                connection,
                                token,
                                timeFrom,
                                timeTo,
                                subaccountName,
                                fetchRoleLogs
                            });

                        chunkEntries.push(
                            ...(roleEntries || [])
                        );

                        console.log(
                            `[ROLE AUDIT] Role log processing successful for ` +
                            `${connection.subaccountId}. ` +
                            `Mapped records: ${roleEntries?.length || 0}`
                        );

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

                        throw new Error(
                            `Role Audit synchronization failed for ` +
                            `subaccount ${connection.subaccountId} ` +
                            `during chunk ${timeFrom} → ${timeTo}: ` +
                            `${connectionError.message}`
                        );
                    }
                }

                // insert chunk records
                if (chunkEntries.length > 0) {
                    const BATCH_SIZE = 500;

                    await cds.tx(
                        {
                            tenant,
                            user: cds.User.privileged
                        },
                        async (tx) => {

                            for (
                                let i = 0;
                                i < chunkEntries.length;
                                i += BATCH_SIZE
                            ) {
                                const batch =
                                    chunkEntries.slice(
                                        i,
                                        i + BATCH_SIZE
                                    );

                                await tx.run(
                                    INSERT
                                        .into(RoleAuditReport)
                                        .entries(batch)
                                );
                            }
                        }
                    );

                    totalProcessedRecords +=
                        chunkEntries.length;
                }

                console.log(
                    `[ROLE AUDIT] Chunk completed successfully: ` +
                    `${timeFrom} → ${timeTo}. ` +
                    `Records: ${chunkEntries.length}`
                );

                // update sync status after successful chunk
                await run(
                    UPDATE(ReportSyncStatus)
                        .set({
                            lastSyncAt: timeTo,
                            lastRunAt: timeTo,
                            lastSyncStatus: "SUCCESS",
                            isRunning: true,
                            runningSince: syncStatus.runningSince,
                            message:
                                `Role Audit synchronization in progress. ` +
                                `Completed chunk ${timeFrom} → ${timeTo}. ` +
                                `${totalProcessedRecords} records processed.`
                        })
                        .where({
                            reportName: "ROLE_AUDIT"
                        })
                );

                chunkFrom = new Date(chunkTo);
            }

            // update final sync status
            const finalTime =
                formatAuditTimestamp(syncEnd);

            const message =
                `Synchronization completed successfully. ` +
                `${totalProcessedRecords} Role Audit records processed.`;

            await run(
                UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncAt: finalTime,
                        lastRunAt: finalTime,
                        lastSyncStatus: "SUCCESS",
                        isRunning: false,
                        runningSince: null,
                        message
                    })
                    .where({
                        reportName: "ROLE_AUDIT"
                    })
            );

            return {
                status: "SUCCESS",
                message,
                processedRecords:
                    totalProcessedRecords,
                failures: []
            };

        } catch (err) {
            const errorMessage = getErrorMessage(err);

            await run(
                UPDATE(ReportSyncStatus)
                    .set({
                        lastRunAt: new Date(),
                        lastSyncStatus: "FAILED",
                        isRunning: false,
                        runningSince: null,
                        message: errorMessage
                    })
                    .where({
                        reportName: "ROLE_AUDIT"
                    })
            );
            throw new Error(errorMessage);
        }
    });
    //========= CONFIGURATION REPORT===================
    this.on("syncConfigurationAuditLogs", async (req) => {
        // Every DB operation in this long-running background job
        // must use this helper so it gets its own short transaction.
        const tenant = req.tenant;
        const run = (query) =>
            cds.tx(
                {
                    tenant,
                    user: cds.User.privileged
                },
                tx => tx.run(query)
            );

        try {
            // Calculate the initial 90-day sync range
            const threeMonthAgo = new Date(
                Date.now() - 90 * 24 * 60 * 60 * 1000
            ).toISOString();

            // Acquire synchronization lock
            const lockResult = await acquireSyncLock({
                reportName: "CONFIGURATION",
                run,
                ReportSyncStatus
            });

            if (!lockResult.acquired) {
                return {
                    status: "RUNNING",
                    message:
                        "Configuration audit synchronization is already running.",
                    processedRecords: 0,
                    failures: []
                };
            }

            const syncStatus = lockResult.syncStatus;
            const failedConnections = [];

            // Fetch active Audit Log connections
            const connections = await run(SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "AUDIT_LOG",
                    active: true
                }));

            if (!connections || connections.length === 0) {
                const lastRunAt = formatAuditTimestamp(new Date());

                await run(UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncStatus: "SUCCESS",
                        isRunning: false,
                        runningSince: null,
                        lastRunAt,
                        message:
                            "No active Audit Log connections found."
                    })
                    .where({
                        reportName: "CONFIGURATION"
                    }));

                return {
                    status: "SUCCESS",
                    message:
                        "No active Audit Log connections found.",
                    processedRecords: 0,
                    failures: []
                };
            }

            // Get ACCOUNTS connection
            const accountsConnection = await run(SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                }));

            // Build subaccount map
            const subaccountMap = await fetchSubaccountMapConfig({
                connections,
                accountsConnection,
                oAuthManager,
                fetchSubaccount,
                failedConnections
            });

            if (failedConnections.length > 0) {
                throw new Error(
                    `Failed to fetch subaccount data for ${failedConnections.length} connection(s).`
                );
            }

            // Determine overall sync window
            const syncStart = syncStatus?.lastSyncAt
                ? new Date(syncStatus.lastSyncAt)
                : new Date(threeMonthAgo);

            const syncEnd = new Date();
            let chunkFrom = new Date(syncStart);
            let totalProcessedRecords = 0;

            // Process the sync window in 10-day chunks
            while (chunkFrom < syncEnd) {
                const chunkTo = new Date(chunkFrom);
                chunkTo.setDate(chunkTo.getDate() + 10);

                if (chunkTo > syncEnd) {
                    chunkTo.setTime(syncEnd.getTime());
                }

                const timeFrom = formatAuditTimestamp(chunkFrom);
                const timeTo = formatAuditTimestamp(chunkTo);
                const chunkEntries = [];

                console.log(
                    `[CONFIGURATION] Processing chunk: ${timeFrom} to ${timeTo}`
                );

                // Process each Audit Log connection
                for (const connection of connections) {
                    const subaccountDetails =
                        subaccountMap.get(connection.subaccountId);

                    const subaccountName =
                        subaccountDetails?.subdomain ||
                        connection.subaccountId;

                    const region =
                        subaccountDetails?.region || null;

                    // Fetch identity provider map
                    const identityProviderMap =
                        await fetchIdentityProviderMapForSubaccount({
                            BTPConnection,
                            subaccountId: connection.subaccountId,
                            oAuthManager,
                            fetchIdentityProviders,
                            failedConnections,
                            run
                        });

                    // Fetch user map
                    const userMap =
                        await fetchUserMapForSubaccount({
                            BTPConnection,
                            subaccountId: connection.subaccountId,
                            cfAuth,
                            fetchAllUsers,
                            failedConnections,
                            run
                        });

                    // Fetch service instance map
                    const instanceMap =
                        await fetchInstanceMapForSubaccount(
                            BTPConnection,
                            connection.subaccountId,
                            failedConnections,
                            fetchServiceInstances,
                            buildInstanceMap,
                            oAuthManager,
                            run
                        );

                    // Process Configuration Audit Logs
                    try {
                        const token =
                            await oAuthManager.getToken(connection);

                        if (!token) {
                            throw new Error(
                                "Audit Log OAuth token was not returned."
                            );
                        }

                        await fetchConfigurationAuditLogs(
                            connection.apiBaseUrl,
                            token,
                            timeFrom,
                            timeTo,
                            async (pageLogs) => {
                                for (const log of pageLogs) {
                                    try {
                                        const mappedEntries =
                                            mapConfigurationAuditLog(
                                                log,
                                                identityProviderMap,
                                                userMap,
                                                instanceMap
                                            );

                                        if (!Array.isArray(mappedEntries)) {
                                            continue;
                                        }

                                        for (const entry of mappedEntries) {
                                            entry.subAccount =
                                                subaccountName;
                                            entry.region = region;
                                            chunkEntries.push(entry);
                                        }
                                    } catch (logError) {
                                        failedConnections.push({
                                            api: "AUDIT_LOG_MAPPING",
                                            subaccountId:
                                                connection.subaccountId,
                                            messageId:
                                                log?.message_uuid,
                                            error:
                                                logError.message
                                        });
                                    }
                                }
                            }
                        );
                    } catch (connectionError) {
                        failedConnections.push({
                            api: "AUDIT_LOG",
                            subaccountId:
                                connection.subaccountId,
                            error:
                                connectionError.message
                        });

                        throw new Error(
                            `Configuration Audit failed for subaccount ${connection.subaccountId}: ${connectionError.message}`
                        );
                    }

                    // Process Cloud Foundry Audit Logs
                    try {
                        const cfConnection = await run(SELECT.one
                            .from(BTPConnection)
                            .where({
                                serviceType: "CLOUD_FOUNDRY",
                                active: true,
                                subaccountId:
                                    connection.subaccountId
                            }));

                        if (!cfConnection) {
                            throw new Error(
                                `No active CLOUD_FOUNDRY connection found for subaccount ${connection.subaccountId}`
                            );
                        }

                        const cftoken =
                            await cfAuth.getToken(cfConnection);

                        if (!cftoken) {
                            throw new Error(
                                "Cloud Foundry OAuth token was not returned."
                            );
                        }

                        const serviceBindingKeyLogs =
                            await fetchServiceBindingAndKeyAuditLogs(
                                cfConnection.apiBaseUrl,
                                cftoken,
                                timeFrom,
                                timeTo
                            );

                        const mappedEntries =
                            mapServiceBindingAndKeyAuditLogs(
                                serviceBindingKeyLogs,
                                {
                                    connection: {
                                        ...connection,
                                        subaccountName,
                                        region
                                    },
                                    instanceMap,
                                    userMap
                                }
                            );

                        chunkEntries.push(...mappedEntries);
                    } catch (error) {
                        failedConnections.push({
                            api: "CF_AUDIT_EVENTS",
                            operation:
                                "SERVICE_BINDING_SERVICE_KEY",
                            subaccountId:
                                connection.subaccountId,
                            error: error.message
                        });

                        throw new Error(
                            `Cloud Foundry Audit failed for subaccount ${connection.subaccountId}: ${error.message}`
                        );
                    }
                }

                // Filter and deduplicate the current chunk
                const filteredEntries =
                    filterConfigurationEntries(chunkEntries);

                const uniqueEntries =
                    deduplicateConfigurationEntries(
                        filteredEntries
                    );

                // Insert the completed chunk
                if (uniqueEntries.length > 0) {
                    const BATCH_SIZE = 500;

                    await cds.tx(
                        {
                            tenant,
                            user: cds.User.privileged
                        },
                        async (tx) => {

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

                                await tx.run(
                                    INSERT
                                        .into(ConfigurationReport)
                                        .entries(batch)
                                );
                            }
                        }
                    );
                }

                totalProcessedRecords +=
                    uniqueEntries.length;

                // Save progress after each successful chunk
                await run(
                    UPDATE(ReportSyncStatus)
                        .set({
                            lastSyncAt: timeTo,
                            lastRunAt: timeTo,
                            lastSyncStatus: "SUCCESS",
                            isRunning: true,
                            runningSince:
                                syncStatus.runningSince,
                            message:
                                `Configuration Audit synchronization progress: ` +
                                `${totalProcessedRecords} records processed.`
                        })
                        .where({
                            reportName: "CONFIGURATION"
                        })
                );

                console.log(
                    `[CONFIGURATION] Chunk completed: ${timeFrom} to ${timeTo}. Records: ${uniqueEntries.length}`
                );

                chunkFrom = new Date(chunkTo);
            }

            const finalTime =
                formatAuditTimestamp(syncEnd);

            const message =
                `Synchronization completed successfully. ${totalProcessedRecords} Configuration Audit records processed.`;

            // Mark the complete synchronization as successful
            await run(
                UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncAt: finalTime,
                        lastRunAt: finalTime,
                        lastSyncStatus: "SUCCESS",
                        isRunning: false,
                        runningSince: null,
                        message
                    })
                    .where({
                        reportName: "CONFIGURATION"
                    })
            );

            return {
                status: "SUCCESS",
                message,
                processedRecords:
                    totalProcessedRecords,
                rawMappedRecords:
                    totalProcessedRecords,
                failures: failedConnections
            };
        } catch (err) {
            // Mark synchronization as failed
            await run(
                UPDATE(ReportSyncStatus)
                    .set({
                        lastRunAt:
                            formatAuditTimestamp(new Date()),
                        lastSyncStatus: "FAILED",
                        isRunning: false,
                        runningSince: null,
                        message: err.message
                    })
                    .where({
                        reportName: "CONFIGURATION"
                    })
            );

            throw err;
        }
    });
    // ====================== user report sync ======================
    this.on("syncUserAuditLogs", async (req) => {
        // Every DB operation in this long-running background job
        // must use this helper so it gets its own short transaction.
        const tenant = req.tenant;
        const run = (query) =>
            cds.tx(
                {
                    tenant,
                    user: cds.User.privileged
                },
                tx => tx.run(query)
            );

        const threeMonthsAgo = new Date(
            Date.now() - 90 * 24 * 60 * 60 * 1000
        ).toISOString();

        const lockResult = await acquireSyncLock({
            reportName: "USER_AUDIT",
            run,
            ReportSyncStatus
        });

        if (!lockResult.acquired) {
            return {
                status: "RUNNING",
                message: "User Audit synchronization is already running.",
                failures: []
            };
        }

        const syncStatus = lockResult.syncStatus;
        const syncStatusId = syncStatus.ID;

        try {
            const failedConnections = [];

            // Fetch active Audit Log connections
            const connections = await run(SELECT
                .from(BTPConnection)
                .where({
                    serviceType: "AUDIT_LOG",
                    active: true
                }));

            if (!connections || connections.length === 0) {
                const timeTo = formatAuditTimestamp(new Date());

                await run(UPSERT.into(ReportSyncStatus).entries({
                    reportName: "USER_AUDIT",
                    lastRunAt: timeTo,
                    lastSyncStatus: "SUCCESS",
                    isRunning: false,
                    runningSince: null,
                    ID: syncStatusId,
                    message: "No active Audit Log connections found."
                }));

                return "No active Audit Log connections found";
            }

            const subaccountIds = [
                ...new Set(
                    connections
                        .map(connection => connection.subaccountId?.trim())
                        .filter(Boolean)
                )
            ];

            // Get ACCOUNTS connection
            const accountsConnection = await run(SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                }));

            const subaccountMap = new Map();

            for (const subaccountId of subaccountIds) {
                subaccountMap.set(subaccountId, subaccountId);
            }

            if (accountsConnection) {
                try {
                    const accountsToken =
                        await oAuthManager.getToken(accountsConnection);

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

            const syncStart = syncStatus?.lastSyncAt
                ? new Date(syncStatus.lastSyncAt)
                : new Date(threeMonthsAgo);

            const syncEnd = new Date();
            let chunkFrom = new Date(syncStart);
            let totalProcessedRecords = 0;

            // Process the sync window in 8-day chunks
            while (chunkFrom < syncEnd) {
                const chunkTo = new Date(chunkFrom);
                chunkTo.setDate(chunkTo.getDate() + 8);

                if (chunkTo > syncEnd) {
                    chunkTo.setTime(syncEnd.getTime());
                }

                const timeFrom =
                    formatAuditTimestamp(chunkFrom);

                const timeTo =
                    formatAuditTimestamp(chunkTo);

                const entries = [];

                console.log(
                    `[USER AUDIT] Processing chunk: ${timeFrom} -> ${timeTo}`
                );

                // Process each Audit Log connection
                for (const connection of connections) {
                    const cleanSubaccountId =
                        connection.subaccountId?.trim();

                    const subaccountName =
                        subaccountMap.get(cleanSubaccountId) ||
                        cleanSubaccountId;

                    let instanceMap = new Map();

                    try {
                        instanceMap =
                            await fetchInstanceMapForSubaccount(
                                BTPConnection,
                                cleanSubaccountId,
                                failedConnections,
                                fetchServiceInstances,
                                buildInstanceMap,
                                oAuthManager,
                                run
                            );

                        console.log(
                            `[USER AUDIT] Instance map loaded for ${cleanSubaccountId}. ` +
                            `Entries: ${instanceMap.size}`
                        );
                    } catch (instErr) {
                        console.warn(
                            `[USER AUDIT] Could not resolve service instances for ${cleanSubaccountId}:`,
                            instErr.message
                        );

                        failedConnections.push({
                            api: "SERVICE_MANAGER",
                            operation: "GET_SERVICE_INSTANCES",
                            subaccountId: cleanSubaccountId,
                            error: instErr.message
                        });
                    }

                    let userMap = new Map();

                    try {
                        const userConnection = await run(SELECT.one
                            .from(BTPConnection)
                            .where({
                                subaccountId: cleanSubaccountId,
                                serviceType: "XSUAA",
                                active: true
                            }));

                        if (!userConnection) {
                            throw new Error(
                                `XSUAA connection not found for subaccount ${cleanSubaccountId}`
                            );
                        }

                        const userToken =
                            await oAuthManager.getToken(userConnection);

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
                            subaccountId: cleanSubaccountId,
                            error: err.message
                        });

                        console.warn(
                            `[USER AUDIT] Could not fetch XSUAA users for ${cleanSubaccountId}:`,
                            err.message
                        );
                    }

                    try {
                        const token =
                            await oAuthManager.getToken(connection);

                        if (!token) {
                            throw new Error(
                                "Audit Log OAuth token was not returned."
                            );
                        }

                        const configEntries =
                            await fetchUserConfigLogs(
                                connection,
                                token,
                                timeFrom,
                                timeTo,
                                userMap,
                                subaccountName,
                                instanceMap
                            );

                        entries.push(
                            ...(configEntries || [])
                        );

                        const securityEntries =
                            await fetchUserAuditLogs(
                                connection,
                                token,
                                timeFrom,
                                timeTo,
                                subaccountName,
                                instanceMap
                            );

                        entries.push(
                            ...(securityEntries || [])
                        );

                        console.log(
                            `[USER AUDIT] ${cleanSubaccountId} | ` +
                            `Config: ${configEntries?.length || 0} | ` +
                            `Security: ${securityEntries?.length || 0}`
                        );
                    } catch (connectionError) {
                        failedConnections.push({
                            api: "AUDIT_LOG",
                            operation: "GET_USER_AUDIT_LOGS",
                            subaccountId: cleanSubaccountId,
                            error: connectionError.message
                        });

                        console.error(
                            `[USER AUDIT] Failed processing subaccount ${cleanSubaccountId}:`,
                            connectionError.message
                        );

                        throw new Error(
                            `User Audit failed for subaccount ${cleanSubaccountId}: ${connectionError.message}`
                        );
                    }
                }

                // Remove invalid user records from the current chunk
                const validEntries = entries.filter(entry => {
                    const userId = entry.userId?.trim();
                    const normalizedUserId =
                        userId?.toLowerCase();

                    return (
                        normalizedUserId &&
                        normalizedUserId !== "anonymous" &&
                        normalizedUserId !== "unknown_user" &&
                        !normalizedUserId.includes(
                            "cn=com.sap.ca.ids"
                        )
                    );
                });

                // Deduplicate and consolidate the current chunk
                const deduplicatedEntries =
                    deduplicateUserAuditEntries(
                        validEntries
                    );

                const processedEntries =
                    consolidateUserPersonaRecords(
                        deduplicatedEntries
                    );

                let processedRecords = 0;

                // Upsert the completed chunk
                if (processedEntries.length > 0) {
                    const BATCH_SIZE = 500;

                    for (
                        let i = 0;
                        i < processedEntries.length;
                        i += BATCH_SIZE
                    ) {
                        const rawBatch =
                            processedEntries.slice(
                                i,
                                i + BATCH_SIZE
                            );

                        const batch = rawBatch.map(item => ({
                            ...item,
                            ID: item.ID || cds.utils.uuid()
                        }));



                        await cds.tx(
                            {
                                tenant,
                                user: cds.User.privileged
                            },
                            async tx => {
                                await tx.run(
                                    UPSERT
                                        .into(UserAuditReport)
                                        .entries(batch)
                                );
                            }
                        );

                        processedRecords += batch.length;

                        console.log(
                            `User Audit batch upserted successfully. ` +
                            `Total processed: ${processedRecords}/${processedEntries.length}`
                        );
                    }
                }

                totalProcessedRecords += processedRecords;

                // Save progress after each successful chunk
                await run(
                    UPDATE(ReportSyncStatus)
                        .set({
                            lastSyncAt: timeTo,
                            lastRunAt: timeTo,
                            lastSyncStatus: "SUCCESS",
                            isRunning: true,
                            runningSince:
                                syncStatus.runningSince,
                            message:
                                `User Audit synchronization progress: ${totalProcessedRecords} records processed.`
                        })
                        .where({
                            ID: syncStatusId
                        })
                );


                console.log(
                    `[USER AUDIT] Chunk completed: ${timeFrom} -> ${timeTo} | ` +
                    `Records: ${processedRecords}`
                );

                chunkFrom = new Date(chunkTo);
            }

            const finalTime =
                formatAuditTimestamp(syncEnd);

            const syncResult =
                failedConnections.length > 0
                    ? "PARTIAL_SUCCESS"
                    : "SUCCESS";

            const syncMessage =
                `Synchronization completed. ` +
                `${totalProcessedRecords} User Audit records processed.` +
                (
                    failedConnections.length > 0
                        ? ` ${failedConnections.length} API failure(s) detected.`
                        : ""
                );

            // Mark the complete synchronization status
            await run(
                UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncAt:
                            syncResult === "SUCCESS"
                                ? finalTime
                                : syncStatus.lastSyncAt,
                        lastRunAt: finalTime,
                        lastSyncStatus: syncResult,
                        isRunning: false,
                        runningSince: null,
                        message: syncMessage
                    })
                    .where({
                        ID: syncStatusId
                    })
            );


            return {
                status: syncResult,
                message: syncMessage,
                processedRecords: totalProcessedRecords,
                failures: failedConnections
            };
        } catch (err) {
            console.error(
                "User Audit Log synchronization failed:",
                err
            );

            // Mark synchronization as failed

            await run(
                UPDATE(ReportSyncStatus)
                    .set({
                        lastRunAt:
                            formatAuditTimestamp(new Date()),
                        lastSyncStatus: "FAILED",
                        isRunning: false,
                        runningSince: null,
                        message: err.message
                    })
                    .where({
                        ID: syncStatusId
                    })
            );

            throw err;
        }
    });
    // ===== Shared helper: handles ack + background execution + status callback =====
    async function runAsyncJob(req, self, eventName, payload = {}) {
        const {
            "x-sap-job-id": jobId,
            "x-sap-job-schedule-id": scheduleId,
            "x-sap-job-run-id": runId,
            "x-sap-scheduler-host": schedulerHost
        } = req.headers;

        const tenant = req.tenant;

        console.log(`[${eventName}] Job started`, {
            jobId,
            scheduleId,
            runId,
            tenant
        });

        // ACK Job Scheduler immediately
        req.res.status(202).send();

        console.log(`[${eventName}] 202 ACK sent`);

        cds.spawn(
            {
                user: cds.User.privileged,
                tenant
            },
            async () => {

                let success = false;
                let message;

                try {

                    console.log(
                        `[${eventName}] Background execution started`
                    );

                    const result = await self.send(
                        eventName,
                        payload
                    );

                    success = result?.status === "SUCCESS";

                    message =
                        result?.message ||
                        `${eventName} completed`;

                    if (result?.failures?.length) {
                        message +=
                            " Errors: " +
                            result.failures
                                .map(
                                    f =>
                                        `${f.subaccountId}: ${f.error}`
                                )
                                .join("; ");
                    }

                    console.log(
                        `[${eventName}] Background execution completed`,
                        {
                            success,
                            message
                        }
                    );

                } catch (err) {

                    console.error(
                        `[${eventName}] Background execution failed`,
                        err
                    );

                    message =
                        err.message ||
                        `${eventName} failed`;

                } finally {

                    try {

                        await updateJobRunStatus({
                            jobId,
                            scheduleId,
                            runId,
                            schedulerHost,
                            success,
                            message
                        });

                    } catch (e) {

                        console.error(
                            `[${eventName}] Could not report status`,
                            e.response?.data || e.message
                        );
                    }
                }
            }
        );
    }

    async function updateJobRunStatus({
        jobId,
        scheduleId,
        runId,
        schedulerHost,
        success,
        message
    }) {
        if (!jobId || !scheduleId || !runId || !schedulerHost) {
            console.warn(
                "Missing job identifiers or scheduler host — cannot report status back",
                {
                    jobId,
                    scheduleId,
                    runId,
                    schedulerHost
                }
            );
            return;
        }



        const { jobscheduler } = xsenv.getServices({
            jobscheduler: { label: "jobscheduler" }
        });

        const tokenResp = await axios.post(
            `${jobscheduler.uaa.url}/oauth/token`,
            new URLSearchParams({
                grant_type: "client_credentials"
            }),
            {
                auth: {
                    username: jobscheduler.uaa.clientid,
                    password: jobscheduler.uaa.clientsecret
                },
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        console.log("Job Scheduler token received");

        const accessToken = tokenResp.data.access_token;

        const url =
            `${schedulerHost}/scheduler/jobs/${jobId}` +
            `/schedules/${scheduleId}/runs/${runId}`;

        console.log("Calling Job Scheduler callback:", url);

        const response = await axios.put(
            url,
            {
                success,
                message
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        console.log(
            "Job Scheduler callback response:",
            response.status,
            response.data
        );
    }

    //===========Job action to Sync Role logs========
    this.on("scheduledSyncRoleLogs", (req) => runAsyncJob(req, this, "syncRoleLogs"));
    //================Job action to Sync Service Logs========
    this.on("scheduledSyncServiceLogs", (req) => runAsyncJob(req, this, "syncServiceLogs"));
    //===============Job action to Sync Config logs======
    this.on("scheduledSyncConfigurationLogs", (req) => runAsyncJob(req, this, "syncConfigurationAuditLogs"));
    //===============Job action to Sync User logs=========
    this.on("scheduledSyncUserLogs", (req) => runAsyncJob(req, this, "syncUserAuditLogs"));

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

    //=====purge data ( add report name , Report type [Only for development , removed from the production])======
    this.on("purgeConfigurationData", async (req) => {
        const { fromTimestamp } = req.data;
        const timestamp = new Date(fromTimestamp);
        await DELETE
            .from(ConfigurationReport) // report name
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
                reportName: "CONFIGURATION"//report type
            });

        return `Configuration data purged from ${timestamp.toISOString()}`;
    });

    //==================================Delete data entirely from the record (only Development , removed from the production)===============

    this.on("clearEntitlements", async (req) => {
        await DELETE.from(ConfigurationReport); // report name
        return {
            status: "SUCCESS",
            message: "All Service Audit records deleted successfully."
        };
    })



});
