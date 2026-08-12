const axios = require("axios");


/**
 * ============================================================
 * FETCH CONFIGURATION AUDIT LOGS
 * ============================================================
 *
 * @param {string} apiBaseUrl
 * @param {string} token
 * @param {string} timeFrom
 * @param {string} timeTo
 *
 * @returns {Array}
 * ============================================================
 */

async function fetchConfigurationAuditLogs(
    apiBaseUrl,
    token,
    timeFrom,
    timeTo
) {

    console.log(
        "================================================="
    );

    console.log(
        "FETCHING CONFIGURATION AUDIT LOGS"
    );

    console.log(
        "================================================="
    );


    if (!apiBaseUrl) {

        throw new Error(
            "Audit Log API base URL is missing."
        );
    }


    if (!token) {

        throw new Error(
            "Audit Log access token is missing."
        );
    }


    /*
     * ============================================================
     * REMOVE TRAILING SLASH
     * ============================================================
     */

    const baseUrl =
        String(apiBaseUrl)
            .replace(/\/+$/, "");


    const url =
        `${baseUrl}/auditlog/v2/auditlogrecords`;


    console.log(
        `Audit Log API: ${url}`
    );


    /*
     * ============================================================
     * RESULT ARRAY
     * ============================================================
     */

    const allLogs = [];


    /*
     * ============================================================
     * PAGINATION
     * ============================================================
     */

    let page = 1;

    let handle = null;


    try {

        while (true) {

            console.log(
                "-------------------------------------------------"
            );

            console.log(
                `Fetching Configuration Audit page ${page}`
            );


            /*
             * ====================================================
             * QUERY PARAMETERS
             * ====================================================
             */

            const params = {};


            /*
             * Add time range only when available.
             */

            if (timeFrom) {

                params.time_from =
                    timeFrom;
            }


            if (timeTo) {

                params.time_to =
                    timeTo;
            }


            /*
             * Configuration audit events.
             */

            params.category =
                "audit.configuration";


            /*
             * Server-side pagination handle.
             */

            if (handle) {

                params.handle =
                    handle;
            }


            console.log(
                "Request params:",
                params
            );


            /*
             * ====================================================
             * API CALL
             * ====================================================
             */

            const response =
                await axios.get(
                    url,
                    {

                        params,

                        headers: {

                            Authorization:
                                `Bearer ${token}`,

                            Accept:
                                "application/json"

                        },

                        timeout:
                            60000
                    }
                );


            /*
             * ====================================================
             * RESPONSE
             * ====================================================
             */

            const data =
                response.data;


            console.log(
                `Configuration Audit API status: ${response.status}`
            );


            /*
             * ====================================================
             * NORMALIZE RESPONSE
             * ====================================================
             */

            let records = [];


            if (
                Array.isArray(data)
            ) {

                records =
                    data;

            } else if (
                Array.isArray(
                    data?.value
                )
            ) {

                records =
                    data.value;

            } else if (
                Array.isArray(
                    data?.results
                )
            ) {

                records =
                    data.results;

            } else if (
                Array.isArray(
                    data?.auditLogRecords
                )
            ) {

                records =
                    data.auditLogRecords;
            }


            console.log(
                `Records received on page ${page}: ${records.length}`
            );


            /*
             * ====================================================
             * MAP RECORDS
             * ====================================================
             */

            for (
                const log
                of records
            ) {

                const entry =
                    mapConfigurationAuditLog(
                        log
                    );


                if (
                    entry
                ) {

                    allLogs.push(
                        entry
                    );
                }
            }


            /*
             * ====================================================
             * PAGINATION HANDLE
             * ====================================================
             *
             * SAP Audit Log Retrieval API can return a handle
             * for the next chunk.
             * ====================================================
             */

            const nextHandle =
                response.headers?.handle ||
                response.headers?.["x-handle"] ||
                data?.handle;


            if (
                !nextHandle ||
                records.length === 0
            ) {

                break;
            }


            handle =
                nextHandle;

            page++;
        }


    } catch (error) {

        console.error(
            "================================================="
        );

        console.error(
            "CONFIGURATION AUDIT API ERROR"
        );

        console.error(
            "================================================="
        );


        console.error(
            "HTTP status:",
            error.response?.status
        );


        console.error(
            "Response:",
            JSON.stringify(
                error.response?.data
            )
        );


        console.error(
            "Error:",
            error.message
        );


        throw error;
    }


    console.log(
        "================================================="
    );

    console.log(
        `TOTAL CONFIGURATION AUDIT LOGS: ${allLogs.length}`
    );

    console.log(
        "================================================="
    );


    return allLogs;
}


/**
 * ============================================================
 * MAP CONFIGURATION AUDIT LOG
 * ============================================================
 */

function mapConfigurationAuditLog(
    log
) {

    if (!log) {

        return null;
    }


    /*
     * ============================================================
     * MESSAGE
     * ============================================================
     */

    let message =
        log.message;


    try {

        if (
            typeof message === "string"
        ) {

            message =
                JSON.parse(
                    message
                );
        }

    } catch (error) {

        console.warn(
            "Unable to parse audit log message:",
            error.message
        );

        return null;
    }


    if (!message) {

        return null;
    }


    /*
     * ============================================================
     * OBJECT
     * ============================================================
     */

    const object =
        message.object?.id ||
        message.object ||
        {};


    /*
     * ============================================================
     * USER
     * ============================================================
     */

    const changedByUserId =
        log.user
            ? String(
                log.user
            )
                .split("/")
                .pop()
            : "";


    /*
     * ============================================================
     * STATUS
     * ============================================================
     */

    const status =
        message.success === false
            ? "Failure"
            : "Success";


    /*
     * ============================================================
     * COMMON INFORMATION
     * ============================================================
     */

    const objectName =
        object.name ||
        object.id ||
        object.objectName ||
        "";


    const tableName =
        object.tableName ||
        object.type ||
        object.table ||
        "";


    const crudType =
        String(
            object.crudType ||
            object.operation ||
            log.crudType ||
            ""
        )
            .toUpperCase();


    /*
     * ============================================================
     * HANDLE UPDATE ATTRIBUTES
     * ============================================================
     */

    if (
        crudType === "UPDATE" &&
        Array.isArray(
            message.attributes
        )
    ) {

        /*
         * Return multiple records for changed fields.
         */

        const updatedEntries = [];


        for (
            const attr
            of message.attributes
        ) {

            if (!attr) {

                continue;
            }


            /*
             * Ignore unchanged attributes.
             */

            if (
                String(
                    attr.old ?? ""
                ) ===
                String(
                    attr.new ?? ""
                )
            ) {

                continue;
            }


            updatedEntries.push({

                system:
                    "BTP",

                roleCollection:
                    objectName,

                event:
                    "Update",

                timestamp:
                    message.time ||
                    log.time ||
                    "",

                changedByUserId:
                    changedByUserId,

                userRole:
                    "",

                fieldChanged:
                    attr.name ||
                    "",

                oldValue:
                    attr.old ??
                    "",

                newValue:
                    attr.new ??
                    "",

                status:
                    status
            });
        }


        /*
         * This function is designed around the existing
         * ConfigurationReport schema.
         *
         * If multiple update attributes exist, return the
         * first one here. If your schema requires every
         * attribute, change the caller to flatten arrays.
         */

        return updatedEntries.length > 0
            ? updatedEntries[0]
            : null;
    }


    /*
     * ============================================================
     * CREATE
     * ============================================================
     */

    if (
        crudType === "CREATE"
    ) {

        return {

            system:
                "BTP",

            roleCollection:
                objectName,

            event:
                "Create",

            timestamp:
                message.time ||
                log.time ||
                "",

            changedByUserId:
                changedByUserId,

            userRole:
                "",

            fieldChanged:
                tableName ||
                "Configuration",

            oldValue:
                "Not Exists",

            newValue:
                objectName,

            status:
                status
        };
    }


    /*
     * ============================================================
     * DELETE
     * ============================================================
     */

    if (
        crudType === "DELETE"
    ) {

        return {

            system:
                "BTP",

            roleCollection:
                objectName,

            event:
                "Delete",

            timestamp:
                message.time ||
                log.time ||
                "",

            changedByUserId:
                changedByUserId,

            userRole:
                "",

            fieldChanged:
                tableName ||
                "Configuration",

            oldValue:
                objectName,

            newValue:
                "Deleted",

            status:
                status
        };
    }


    /*
     * ============================================================
     * UNKNOWN EVENT
     * ============================================================
     */

    return null;
}


module.exports = {

    fetchConfigurationAuditLogs

};