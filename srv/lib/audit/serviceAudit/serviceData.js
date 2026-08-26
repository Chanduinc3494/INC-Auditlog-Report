const {
    fetchServicePlans,
    fetchServiceOfferings,
    fetchServiceInstances
} = require("../../api/service/serviceAuditApi");



async function fetchServiceData(
    connection,
    token,
    failedConnections
) {

    let sapBtpPlans = [];
    let cloudFoundryPlans = [];

    let sapBtpOfferings = [];
    let cloudFoundryOfferings = [];

    let instances = [];

    /*
     * --------------------------------------------------
     * SERVICE PLANS
     * --------------------------------------------------
     */

    try {

        sapBtpPlans = await fetchServicePlans(
            connection.apiBaseUrl,
            token,
            "sapbtp"
        );

    } catch (err) {

        failedConnections.push({
            api: "SERVICE_MANAGER",
            operation: "GET_SERVICE_PLANS",
            environment: "sapbtp",
            subaccountId: connection.subaccountId,
            error: err.message
        });
    }

    try {

        cloudFoundryPlans = await fetchServicePlans(
            connection.apiBaseUrl,
            token,
            "cloudfoundry"
        );

    } catch (err) {

        failedConnections.push({
            api: "SERVICE_MANAGER",
            operation: "GET_SERVICE_PLANS",
            environment: "cloudfoundry",
            subaccountId: connection.subaccountId,
            error: err.message
        });
    }

    /*
     * --------------------------------------------------
     * SERVICE OFFERINGS
     * --------------------------------------------------
     */

    try {

        sapBtpOfferings = await fetchServiceOfferings(
            connection.apiBaseUrl,
            token,
            "sapbtp"
        );

    } catch (err) {

        failedConnections.push({
            api: "SERVICE_MANAGER",
            operation: "GET_SERVICE_OFFERINGS",
            environment: "sapbtp",
            subaccountId: connection.subaccountId,
            error: err.message
        });
    }

    try {

        cloudFoundryOfferings = await fetchServiceOfferings(
            connection.apiBaseUrl,
            token,
            "cloudfoundry"
        );

    } catch (err) {

        failedConnections.push({
            api: "SERVICE_MANAGER",
            operation: "GET_SERVICE_OFFERINGS",
            environment: "cloudfoundry",
            subaccountId: connection.subaccountId,
            error: err.message
        });
    }

    /*
     * --------------------------------------------------
     * SERVICE INSTANCES
     * --------------------------------------------------
     */

    try {

        instances = await fetchServiceInstances(
            connection.apiBaseUrl,
            token
        );

    } catch (err) {

        failedConnections.push({
            api: "SERVICE_MANAGER",
            operation: "GET_SERVICE_INSTANCES",
            subaccountId: connection.subaccountId,
            error: err.message
        });

        /*
         * Instance data is required for the rest of
         * the processing, so tell the caller that
         * this subaccount cannot continue.
         */
        return {
            plans: [
                ...sapBtpPlans,
                ...cloudFoundryPlans
            ],
            offerings: [
                ...sapBtpOfferings,
                ...cloudFoundryOfferings
            ],
            instances: null,
            canContinue: false
        };
    }

    return {
        plans: [
            ...sapBtpPlans,
            ...cloudFoundryPlans
        ],

        offerings: [
            ...sapBtpOfferings,
            ...cloudFoundryOfferings
        ],

        instances,

        canContinue: true
    };
}


module.exports = {
    fetchServiceData
};