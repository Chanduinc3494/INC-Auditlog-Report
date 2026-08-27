const axios = require("axios");

function toCfTimestamp(timestamp) {
    if (!timestamp) {
        return timestamp;
    }

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        throw new Error(
            `Invalid timestamp: ${timestamp}`
        );
    }

    return date.toISOString()
        .replace(".000Z", "Z");
}


async function fetchServiceBindingAndKeyAuditLogs(
    apiBaseUrl,
    token,
    timeFrom,
    timeTo
) {

    if (!apiBaseUrl) {
        throw new Error(
            "Cloud Foundry API base URL is missing."
        );
    }

    if (!token) {
        throw new Error(
            "Cloud Foundry access token is missing."
        );
    }

    if (!timeFrom) {
        throw new Error(
            "Cloud Foundry timeFrom is missing."
        );
    }

    if (!timeTo) {
        throw new Error(
            "Cloud Foundry timeTo is missing."
        );
    }

    const baseUrl =
        String(apiBaseUrl)
            .replace(/\/+$/, "");

    const url =
        `${baseUrl}/v3/audit_events`;


    /*
     * Convert timestamps to CF format:
     *
     * YYYY-MM-DDThh:mm:ssZ
     */
    const cfTimeFrom =
        toCfTimestamp(timeFrom);

    const cfTimeTo =
        toCfTimestamp(timeTo);


    const trackedTypes = [
        "audit.service_binding.create",
        "audit.service_binding.delete",
        "audit.service_key.create",
        "audit.service_key.delete"
    ];


    const allEvents = [];


    try {

        console.log(
            "[CF AUDIT] Base URL:",
            baseUrl
        );

        console.log(
            "[CF AUDIT] Time From:",
            cfTimeFrom
        );

        console.log(
            "[CF AUDIT] Time To:",
            cfTimeTo
        );


        for (
            const eventType
            of trackedTypes
        ) {

            console.log(
                `[CF AUDIT] Fetching: ${eventType}`
            );


            let nextUrl = url;

            let firstRequest = true;


            while (nextUrl) {

                const response =
                    await axios.get(
                        nextUrl,
                        {

                            params:
                                firstRequest
                                    ? {

                                        order_by:
                                            "-created_at",

                                        types:
                                            eventType,

                                        "created_ats[gt]":
                                            cfTimeFrom,

                                        "created_ats[lt]":
                                            cfTimeTo
                                    }
                                    : undefined,


                            headers: {

                                Authorization:
                                    `Bearer ${token}`,

                                Accept:
                                    "application/json"
                            },


                            timeout: 30000
                        }
                    );


                firstRequest = false;


                const resources =
                    Array.isArray(
                        response.data?.resources
                    )
                        ? response.data.resources
                        : [];


                console.log(
                    `[CF AUDIT] ${eventType}: ` +
                    `${resources.length} events`
                );


                allEvents.push(
                    ...resources
                );


                /*
                 * Follow CF pagination.
                 */
                nextUrl =
                    response.data
                        ?.pagination
                        ?.next
                        ?.href ||
                    null;
            }
        }


        /*
         * Sort all events by newest first.
         */
        allEvents.sort(
            (a, b) =>
                new Date(
                    b.created_at
                ) -
                new Date(
                    a.created_at
                )
        );


        console.log(
            `[CF AUDIT] Total service binding/key events: ` +
            `${allEvents.length}`
        );


        return allEvents;


    } catch (error) {

        console.error(
            "[CF AUDIT] Request failed"
        );

        console.error(
            "[CF AUDIT] Status:",
            error.response?.status
        );

        console.error(
            "[CF AUDIT] Response:",
            error.response?.data
        );

        console.error(
            "[CF AUDIT] URL:",
            error.config?.url
        );

        console.error(
            "[CF AUDIT] Params:",
            error.config?.params
        );


        const status =
            error.response?.status;

        const details =
            error.response?.data?.description ||
            error.response?.data?.message ||
            error.message;


        throw new Error(
            `Failed to fetch service binding/key audit events` +
            `${status ? ` (HTTP ${status})` : ""}: ${details}`
        );
    }
}


module.exports = {
    fetchServiceBindingAndKeyAuditLogs
};