sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog"
], function (MessageToast, MessageBox, BusyDialog) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
         * @param aSelectedContexts the selected contexts of the table rows.
         */
        SyncBtnFunction: async function (oContext, aSelectedContexts) {
            const oBusyDialog = new BusyDialog({
                title: "Loading",
                text: "Fetching data..."
            });
            try {
                oBusyDialog.open();
                // --------------------------------------------------
                // 1. Get the List Report page
                // --------------------------------------------------

                const oPage = sap.ui.getCore().byId(
                    "configurationreport::ConfigurationReportList"
                );

                if (!oPage) {
                    throw new Error(
                        "Configuration  List Report page not found."
                    );
                }

                // --------------------------------------------------
                // 2. Get the OData V4 model
                // --------------------------------------------------

                const oModel = oPage.getModel();

                if (!oModel) {
                    throw new Error(
                        "OData V4 model not found."
                    );
                }
                // --------------------------------------------------
                // 3. Create operation binding for unbound action
                // --------------------------------------------------

                const oOperation = oModel.bindContext(
                    "/syncConfigurationAuditLogs(...)"
                );

                // --------------------------------------------------
                // 4. Execute CAP action
                // --------------------------------------------------

                await oOperation.execute("$direct");

                // --------------------------------------------------
                // 5. Read action response
                // --------------------------------------------------

                const oResult =
                    oOperation.getBoundContext().getObject();

                if (
                    oResult?.failures &&
                    oResult.failures.length > 0
                ) {

                    console.error(
                        "Configuration synchronization failures:",
                        oResult.failures
                    );

                    oResult.failures.forEach(function (failure) {

                        console.error(
                            `[${failure.api}] ` +
                            `[${failure.operation || "N/A"}] ` +
                            `Subaccount: ${failure.subaccountId || "N/A"} ` +
                            `Error: ${failure.error || "Unknown error"}`
                        );

                    });
                }
                if (oResult?.status === "RUNNING") {

                    MessageBox.information(
                        oResult.message,
                        {
                            title: "Synchronization In Progress"
                        }
                    );

                } else if (oResult?.status === "PARTIAL_SUCCESS") {

                    MessageBox.warning(
                        oResult.message,
                        {
                            title: "Synchronization Completed with Warnings"
                        }
                    );

                    oModel.refresh("$auto");

                } else if (oResult?.status === "SUCCESS") {

                    MessageToast.show(
                        oResult.message ||
                        "Configuration synchronization completed successfully."
                    );

                    oModel.refresh("$auto");

                } else if (oResult?.status === "FAILED") {

                    MessageBox.error(
                        oResult.message ||
                        "Configuration synchronization failed."
                    );

                } else {

                    MessageBox.warning(
                        oResult.message ||
                        "Unexpected synchronization status received."
                    );
                }

            } catch (err) {

                console.error(
                    "syncConfigurationAuditLogs failed:",
                    err
                );

                MessageBox.error(
                    err.message ||
                    "Configuration synchronization failed."
                );
            } finally {

                // Always close BusyDialog
                oBusyDialog.close();

                // Destroy it after use
                oBusyDialog.destroy();
            }
        }
    };
});
