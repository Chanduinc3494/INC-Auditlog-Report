sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function(MessageToast, MessageBox) {
    "use strict";

    return {
        SyncConfigurationAuditLogs: async function() {
            try {

                const response = await fetch(
                    "/odata/v4/audit-logging-and-reporting/syncConfigurationAuditLogs",
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

                const result = await response.json();

                MessageToast.show(
                    result.value ||
                    "Synchronization completed successfully."
                );

                const oPage = sap.ui.getCore().byId(
                    "configurationreport::ConfigurationReportList"
                );

                if (!oPage) {
                    console.error(
                        "Configuration Audit List Report page not found."
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
