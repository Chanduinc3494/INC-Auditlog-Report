const axios = require("axios");
const cds = require("@sap/cds");
const auth = require("./authLog");

async function fetchAuditLogs() {

    const token = await auth.getToken();

    const credentials = cds.env.requires.auditlog.credentials;

    const response = await axios.get(
        credentials.uri + "/auditlog/v2/auditlogrecords",
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    return response.data;
}

module.exports = {
    fetchAuditLogs
};