const cds = require("@sap/cds");
const axios = require("axios");

async function getToken() {

    const credentials = cds.env.requires.auditlog.credentials;
    const uaa = credentials.uaa || credentials;
    const tokenUrl =
        uaa.url.endsWith("/oauth/token")
            ? uaa.url
            : `${uaa.url.replace(/\/+$/, "")}/oauth/token`;

    const response = await axios.post(
        tokenUrl,
        "grant_type=client_credentials",
        {
            auth: {
                username: uaa.clientid,
                password: uaa.clientsecret
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        }
    );

    return response.data.access_token;
}

function getApiBaseUrl() {

    const credentials = cds.env.requires.auditlog.credentials;

    return credentials.url || credentials.apiurl;
}

module.exports = {
    getToken,
    getApiBaseUrl
};
