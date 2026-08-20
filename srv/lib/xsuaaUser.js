const axios = require("axios");

function getAuditlogXsuaaCredentials() {

    const vcapServices =
        process.env.VCAP_SERVICES;

    if (!vcapServices) {
        throw new Error(
            "VCAP_SERVICES is not available."
        );
    }

    const services =
        JSON.parse(vcapServices);

    const xsuaaServices =
        services.xsuaa || [];

    const service =
        xsuaaServices.find(
            item =>
                item.name === "auditlog-xsuaa"
        );

    if (!service) {
        throw new Error(
            "auditlog-xsuaa service binding was not found."
        );
    }

    if (!service.credentials) {
        throw new Error(
            "auditlog-xsuaa credentials were not found."
        );
    }

    return service.credentials;
}


async function getXsuaaToken() {

    const credentials =
        getAuditlogXsuaaCredentials();

    const {
        apiurl,
        clientid,
        clientsecret
    } = credentials;

    if (
        !apiurl ||
        !clientid ||
        !clientsecret
    ) {
        throw new Error(
            "auditlog-xsuaa credentials are incomplete."
        );
    }

    const tokenUrl =
        `${apiurl.replace(/\/+$/, "")}/oauth/token`;

    console.log(
        "Requesting XSUAA token from:",
        apiurl
    );

    const response =
        await axios.post(
            tokenUrl,
            new URLSearchParams({
                grant_type:
                    "client_credentials"
            }).toString(),
            {
                auth: {
                    username: clientid,
                    password: clientsecret
                },
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                timeout: 30000
            }
        );

    if (
        !response.data ||
        !response.data.access_token
    ) {
        throw new Error(
            "XSUAA access token was not returned."
        );
    }

    console.log(
        "XSUAA token successfully received."
    );

    return response.data.access_token;
}


module.exports = {
    getAuditlogXsuaaCredentials,
    getXsuaaToken
};