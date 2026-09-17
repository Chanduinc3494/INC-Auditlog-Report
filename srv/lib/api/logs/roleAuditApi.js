
const axios = require("axios");

async function fetchRoleLogs(baseUrl, token, timeFrom, timeTo) {
    const allLogs = [];
    let handle = null;
    let page = 0;

    try {
        while (true) {
            page++;

            const url = handle
                ? `${baseUrl}/auditlog/v2/auditlogrecords?handle=${encodeURIComponent(handle)}`
                : `${baseUrl}/auditlog/v2/auditlogrecords` +
                `?category=audit.configuration` +
                `&time_from=${encodeURIComponent(timeFrom)}` +
                `&time_to=${encodeURIComponent(timeTo)}`;

            const start = Date.now();

            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                timeout: 300000
            });

            if (response.status === 204) {
                break;
            }

            const duration = Date.now() - start;
            console.log(
                `[ROLE AUDIT] Page ${page} loaded successfully | ` +
                `Raw records: ${response.data.length} | ` +
                `Time: ${duration} ms`
            );
            const requiredLogs = response.data.filter(log => {
                const message =
                    typeof log.message === "string"
                        ? JSON.parse(log.message)
                        : log.message;

                const obj = message?.object?.id;

                return (
                    (obj?.tableName === "xsrolecollections" &&
                        ["CREATE", "UPDATE", "DELETE"].includes(obj?.crudType)) ||
                    (obj?.tableName === "xsrolecollection2role" &&
                        ["CREATE", "DELETE"].includes(obj?.crudType))
                );
            });

            allLogs.push(...requiredLogs);

            handle = extractHandle(response.headers["paging"]);

            if (!handle) break;

        }
        return allLogs;

    } catch (err) {
        const status = err.response?.status;
        const data = err.response?.data;

        let details;

        if (typeof data === "string") {
            details = data;
        } else if (data?.message) {
            details = data.message;
        } else if (data?.error_description) {
            details = data.error_description;
        } else if (data?.error) {
            details = data.error;
        } else {
            details = err.message;
        }

        throw new Error(
            `Failed to fetch role audit logs` +
            `${status ? ` (HTTP ${status})` : ""}: ` +
            `${details}`
        );
    }
}

function extractHandle(pagingHeader) {
    if (!pagingHeader) {
        return null;
    }

    const match = pagingHeader.match(/handle=([^;]+)/);
    return match ? match[1] : null;
}

module.exports = {
    fetchRoleLogs
};