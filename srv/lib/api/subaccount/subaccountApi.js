const axios = require("axios");

async function fetchSubaccount(baseUrl, token, subaccountIds) {

    const subaccountMap = new Map();
    const failures = [];
    for (const subaccountId of subaccountIds) {

        try {

            const response = await axios.get(
                `${baseUrl}/accounts/v1/subaccounts/${subaccountId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const subaccount = response.data;

            subaccountMap.set(
                subaccountId,
                {
                    subdomain: subaccount.subdomain,
                    region: subaccount.region
                }
            );

        } catch (err) {

           const data = err.response?.data;

            const errorMessage =
                typeof data === "string"
                    ? data
                    : data?.message ||
                      data?.error_description ||
                      data?.error ||
                      err.message;

           

            // Store failure
            failures.push({
                api: "ACCOUNTS",
                operation:"GET_SUBACCOUNT",
                subaccountId: subaccountId,
                error: errorMessage,
            });


            // Keep the ID as fallback
            subaccountMap.set(
                subaccountId,
                {
                    subdomain: subaccountId,
                    region: null
                }
            );
        }
    }
    
    return {subaccountMap,failures};
}

module.exports = {
    fetchSubaccount
};