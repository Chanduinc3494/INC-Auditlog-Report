const axios = require("axios");
const cds = require("@sap/cds");


async function fetchAccountDirectory(token) {


    const credentials = cds.env.requires.cms.credentials;

    const response = await axios.get(
        credentials.endpoints.accounts_service_url + "/accounts/v1/subaccounts",
        {   
            params:{
                directoryGUID:"0c4f7364-524d-4cfe-aa95-403e51e3b9c9"
            },
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    

    return response.data;
}

async function fetchEntitlementsLogs(token,subaccountId) {

    //const token = await auth.getToken();

    const credentials = cds.env.requires.cms.credentials;

    const response = await axios.get(
        credentials.endpoints.entitlements_service_url + "/entitlements/v1/assignments",
        {
            params:{
                subaccountGUID:subaccountId
            },
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
   

    return response.data;
}
module.exports = {
    fetchEntitlementsLogs,
    fetchAccountDirectory
};