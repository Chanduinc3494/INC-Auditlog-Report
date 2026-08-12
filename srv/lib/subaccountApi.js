const axios = require("axios");

async function fetchSubaccount(baseUrl, token, subaccountIds) {

    const subaccountMap = new Map();

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

            console.error(
                `Failed to fetch subaccount ${subaccountId}:`,
                err.response?.data || err.message
            );

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

    return subaccountMap;
}

module.exports = {
    fetchSubaccount
};