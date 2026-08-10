sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
    "use strict";

    return {

        SyncServiceLogs: async function (oContext, aSelectedContexts) {

            try {

                // --------------------------------------------------
                // 1. Call CAP action
                // --------------------------------------------------

                const response = await fetch(
                    "/odata/v4/audit-logging-and-reporting/syncServiceLogs",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({})
                    }
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        errorText || "Synchronization failed."
                    );
                }

                // --------------------------------------------------
                // 2. Read response
                // --------------------------------------------------

                const result = await response.json();

                MessageToast.show(
                    result.value ||
                    "Synchronization completed successfully."
                );

                // --------------------------------------------------
                // 3. Refresh Fiori Elements List Report
                // --------------------------------------------------

                const oPage = sap.ui.getCore().byId(
                    "servicesauditreport::ServiceAuditReportsList"
                );

                if (!oPage) {
                    console.error(
                        "Service Audit List Report page not found."
                    );
                    return;
                }

                const oModel = oPage.getModel();

                if (oModel) {
                    oModel.refresh("$auto");
                }

            } catch (err) {

                console.error(
                    "Synchronization error:",
                    err
                );

                MessageBox.error(
                    err.message ||
                    "Synchronization failed."
                );
            }
        }
    };
});