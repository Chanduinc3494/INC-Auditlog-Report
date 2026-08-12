const cds = require("@sap/cds");
const axios = require("axios");

// async function getToken(connection) {

//     const response = await axios.post(

//         connection.tokenUrl + "/oauth/token",

//         "grant_type=client_credentials",

//         {

//             auth: {

//                 username: connection.clientId,

//                 password: connection.clientSecret

//             },

//             headers: {

//                 "Content-Type":
//                     "application/x-www-form-urlencoded"

//             }

//         }

//     );

//     return response.data.access_token;
// }

// module.exports = {
//     getToken
// };

async function getToken(connection) {

    try {

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

    } catch (err) {

        const status =
            err.response?.status;

        const data =
            err.response?.data;

        console.error(
            "OAuth token request failed:",
            {
                subaccountId: connection.subaccountId,
                status,
                data
            }
        );

        if (status === 401) {
            throw new Error(
                `Authentication failed for subaccount ` +
                `${connection.subaccountId}. ` +
                `Please check the client credentials.`
            );
        }

        if (status === 403) {
            throw new Error(
                `Authorization failed for subaccount ` +
                `${connection.subaccountId}.`
            );
        }

        throw new Error(
            `Unable to obtain OAuth token for subaccount ` +
            `${connection.subaccountId}. ` +
            `${data?.error_description || err.message}`
        );
    }
}
module.exports = {
    getToken
};