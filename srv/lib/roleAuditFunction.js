const axios= require("axios");
async function fetchRoleLogs(baseUrl, token, timeFrom, timeTo) {

    const allLogs = [];

    let handle = null;

    while (true) {

        let url;

        if (handle) {

            url = `${baseUrl}/auditlog/v2/auditlogrecords?handle=${encodeURIComponent(handle)}`;

        } else {

            url =
                `${baseUrl}/auditlog/v2/auditlogrecords` +
                `?category=audit.configuration` +
                `&time_from=${encodeURIComponent(timeFrom)}` +
                `&time_to=${encodeURIComponent(timeTo)}`;
        }

        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        allLogs.push(...response.data);

        handle = extractHandle(response.headers["paging"]);

        if (!handle) {
            break;
        }
    }

    return allLogs;
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