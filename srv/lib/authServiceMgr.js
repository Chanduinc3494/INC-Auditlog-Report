const cds = require("@sap/cds");
const axios = require("axios");

async function getToken(connection) {

    const response = await axios.post(

        connection.tokenUrl + "/oauth/token",

        "grant_type=client_credentials",

        {

            auth: {

                username: connection.clientId,

                password: connection.clientSecret

            },

            headers: {

                "Content-Type":
                    "application/x-www-form-urlencoded"

            }

        }

    );

    return response.data.access_token;
}

module.exports = {
    getToken
};