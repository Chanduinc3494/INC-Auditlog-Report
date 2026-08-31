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
const { fetchIdentityProviders} = require("./lib/api/identity/identityProviderApi"); // xsuaa apis


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

//user Audit Functions
const { deduplicateUserAuditEntries, consolidateUserPersonaRecords } = require("./lib/userAuditfns");
const { processUserAuditConnections } = require("./lib/audit/userAudit/processUserAuditConnections");

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
        let firstSyncAt;
        if (isFirstSync) {
            firstSyncAt = threeMonthsAgo;
        } else {
            firstSyncAt = new Date(syncStatus.firstSyncAt);
        }
        console.log(firstSyncAt);
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
            console.log(syncStatus);
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
            const finalLastSyncAt =
                finalSyncStatus === "SUCCESS"
                    ? new Date()
                    : syncStatus?.lastSyncAt;

            if (isFirstSync) {
                await UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncAt: finalLastSyncAt,
                        lastRunAt: new Date(),
                        lastSyncStatus: finalSyncStatus,
                        isRunning: false,
                        firstSyncAt: firstSyncAt,
                        message: message
                    })
                    .where({
                        reportName: "SERVICE_AUDIT"
                    });
            }
            else {
                await UPDATE(ReportSyncStatus)
                    .set({
                        lastSyncAt: finalLastSyncAt,
                        lastRunAt: new Date(),
                        lastSyncStatus: finalSyncStatus,
                        isRunning: false,
                        message: message
                    })
                    .where({
                        reportName: "SERVICE_AUDIT"
                    });
            }



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

                await cds.tx(async (tx) => {

                    for (let i = 0; i < entries.length; i += BATCH_SIZE) {

                        const batch = entries.slice(i, i + BATCH_SIZE);

                        await tx.run(
                            INSERT.into(RoleAuditReport).entries(batch)
                        );
                    }
                });
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

            //Get ACCOUNTS connection
            const accountsConnection =
                await SELECT.one
                    .from(BTPConnection)
                    .where({
                        serviceType: "ACCOUNTS",
                        active: true
                    });



            // Subaccount Map with subaccount Name and region
            const subaccountMap = await fetchSubaccountMapConfig({ connections, accountsConnection, oAuthManager, fetchSubaccount, failedConnections });

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


            // Collect mapped business-level entries
            const entries = [];


            // Process every AUDIT_LOG connection
            for (
                const connection
                of connections
            ) {

                const subaccountDetails = subaccountMap.get(connection.subaccountId);
                const subaccountName = subaccountDetails?.subdomain || connection.subaccountId;
                const region = subaccountDetails?.region || null;

                //identity provider for trust
                const identityProviderMap = await fetchIdentityProviderMapForSubaccount({
                    BTPConnection,
                    subaccountId: connection.subaccountId,
                    oAuthManager,
                    fetchIdentityProviders,
                    failedConnections,
                    SELECT
                });

                // User map for configuration audit logs
                const userMap = await fetchUserMapForSubaccount({
                    BTPConnection,
                    subaccountId: connection.subaccountId,
                    cfAuth,
                    fetchAllUsers,
                    failedConnections,
                    SELECT
                })

                const instanceMap =
                    await fetchInstanceMapForSubaccount(
                        BTPConnection,
                        connection.subaccountId,
                        failedConnections,
                        fetchServiceInstances,
                        buildInstanceMap,
                        oAuthManager
                    );

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
                                    userMap,
                                    instanceMap
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

                                // Enrichment from connection
                                entry.subAccount = subaccountName;

                                entry.region = region;

                                entries.push(
                                    entry
                                );
                            }

                        } catch (logError) {

                            failedConnections.push({
                                api: "AUDIT_LOG_MAPPING",
                                subaccountId: connection.subaccountId,
                                messageId: log?.message_uuid,
                                error: logError.message
                            });
                        }
                    }


                } catch (connectionError) {

                    failedConnections.push({
                        api: "AUDIT_LOG",
                        subaccountId: connection.subaccountId,
                        error: connectionError.message
                    });

                    continue;
                }

                // to fetch CF audit logs

                try {

                    const cfConnection =
                        await SELECT.one
                            .from(BTPConnection)
                            .where({
                                serviceType: "CLOUD_FOUNDRY",
                                active: true,
                                subaccountId: connection.subaccountId
                            });

                    if (!cfConnection) {
                        throw new Error(
                            `No active CLOUD_FOUNDRY connection found for subaccount ` +
                            `${connection.subaccountId}`
                        );
                    }
                    const cftoken =
                        await cfAuth.getToken(
                            cfConnection
                        );

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

                    entries.push(
                        ...mappedEntries
                    );

                } catch (error) {

                    failedConnections.push({
                        api: "CF_AUDIT_EVENTS",
                        operation: "SERVICE_BINDING_SERVICE_KEY",
                        subaccountId: connection.subaccountId,
                        error: error.message
                    });
                }
            }



            //Filter enteries to remove un-necessary rows
            const filteredEntries =
                filterConfigurationEntries(
                    entries
                );
            // Deduplicate logical reporting rows
            const uniqueEntries =
                deduplicateConfigurationEntries(
                    filteredEntries
                );


            // Insert clean business-level records
            if (uniqueEntries.length > 0) {

                const BATCH_SIZE = 500;

                await cds.tx(async (tx) => {

                    for (
                        let i = 0;
                        i < uniqueEntries.length;
                        i += BATCH_SIZE
                    ) {

                        const batch = uniqueEntries.slice(
                            i,
                            i + BATCH_SIZE
                        );

                        await tx.run(
                            INSERT
                                .into(ConfigurationReport)
                                .entries(batch)
                        );
                    }

                });
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
                            lastSyncAt: finalLastSyncAt,
                            lastRunAt: timeTo,
                            lastSyncStatus: finalSyncStatus,
                            isRunning: false,
                            message: message
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
    // ====================== user report sync ======================
    this.on("syncUserAuditLogs", async () => {

        const threeMonthAgo = new Date();
        threeMonthAgo.setMonth(threeMonthAgo.getMonth() - 3);
        // get the sync status
        const syncStatus = await SELECT.one
            .from(ReportSyncStatus)
            .where({
                reportName: "USER_AUDIT"
            });

        if (syncStatus?.isRunning) {
            return {
                status: "RUNNING",
                message: "User Audit synchronization is already running.",
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


            // fetching the credential for the subaccount names
            const accountsConnection = await SELECT.one
                .from(BTPConnection)
                .where({
                    serviceType: "ACCOUNTS",
                    active: true
                });

            // subaccount mapping
            const subaccountMap = await fetchSubaccountsData({ connections, accountsConnection, oAuthManager, fetchSubaccount, failedConnections })

            const timeFrom = syncStatus?.lastSyncAt
                ? formatAuditTimestamp(syncStatus.lastSyncAt)
                : formatAuditTimestamp(threeMonthAgo);

            const timeTo = formatAuditTimestamp(new Date());
            // fetch and Process Audit Logs
            const entries = await processUserAuditConnections({ connections, subaccountMap, timeFrom, timeTo, failedConnections , BTPConnection,oAuthManager});
            const finalSyncStatus =
                failedConnections.length > 0 ? "PARTIAL_SUCCESS" : "SUCCESS";

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

            // Remove immediate duplicate payload logs
            const deduplicatedEntries = deduplicateUserAuditEntries(entries);

            // Keep only the single latest record per user persona
            const processedEntries = consolidateUserPersonaRecords(deduplicatedEntries);

            let processedRecords = 0;

            if (processedEntries.length > 0) {
                const BATCH_SIZE = 500;
                await cds.tx(async (tx) => {
                    for (
                        let i = 0;
                        i < processedEntries.length;
                        i += BATCH_SIZE
                    ) {
                        const rawBatch = processedEntries.slice(
                            i,
                            i + BATCH_SIZE
                        );

                        const batch = rawBatch.map(item => ({
                            ...item,
                            ID: item.ID || cds.utils.uuid()
                        }));

                        console.log(
                            `Upserting User Audit batch ${Math.floor(i / BATCH_SIZE) + 1
                            } (${batch.length} records)...`
                        );

                        await tx.run(
                            UPSERT.into(UserAuditReport).entries(batch)
                        );

                        processedRecords += batch.length;

                        console.log(
                            `User Audit batch upserted successfully. ` +
                            `Total processed: ${processedRecords}/${processedEntries.length}`
                        );
                    }
                });
            }

            const syncResult =
                failedConnections.length > 0 ? "PARTIAL_SUCCESS" : "SUCCESS";

            const syncMessage =
                `Synchronization completed. ${processedRecords} User Audit records processed.` +
                (failedConnections.length > 0
                    ? ` ${failedConnections.length} API failure(s) detected.`
                    : "");

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
                            message: syncMessage
                        })
                        .where({
                            ID: syncStatusId
                        })
                );
            });

            return {
                status: syncResult,
                message: syncMessage,
                processedRecords: processedRecords,
                failures: failedConnections
            };

        } catch (err) {
            console.error("User Audit Log synchronization failed:", err);

            await cds.tx(async (tx) => {
                await tx.run(
                    UPDATE(ReportSyncStatus)
                        .set({
                            lastRunAt: formatAuditTimestamp(new Date()),
                            lastSyncStatus: "FAILED",
                            isRunning: false,
                            message: err.message
                        })
                        .where({
                            ID: syncStatusId
                        })
                );
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
        await DELETE.from(ServiceAuditReport); // report name
        return {
            status: "SUCCESS",
            message: "All Service Audit records deleted successfully."
        };
    })



});
