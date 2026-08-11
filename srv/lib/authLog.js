const cds = require("@sap/cds");
const axios = require("axios");

async function getToken() {

    const credentials = cds.env.requires.auditlog.credentials;

    const response = await axios.post(
        credentials.url + "/oauth/token",
        "grant_type=client_credentials",
        {
            auth: {
                username: credentials.clientid,
                password: credentials.clientsecret
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        }
    );

    return response.data.access_token;
}

module.exports = {
    getToken
};