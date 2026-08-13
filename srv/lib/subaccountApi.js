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

            const errorMessage =
                err.response?.data?.message ||
                err.response?.data?.error_description ||
                err.response?.data ||
                err.message;

            console.error(
                `Accounts API failed for subaccount ${subaccountId}:`,
                errorMessage
            );

            // Store failure
            failures.push({
                api: "ACCOUNTS",
                operation:"API_CAL",
                subaccountId: subaccountId,
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
    console.log(failures);
    return {subaccountMap,failures};
}

module.exports = {
    fetchSubaccount
};