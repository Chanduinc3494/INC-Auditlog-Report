
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog"
], function (MessageToast, MessageBox, BusyDialog) {
    "use strict";

    return {

        SyncServiceLogs: async function (oContext, aSelectedContexts) {
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
                    "servicesauditreport::ServiceAuditReportsList"
                );

                if (!oPage) {
                    throw new Error(
                        "Service Audit List Report page not found."
                    );
                }

                // --------------------------------------------------
                // 2. Get OData V4 model
                // --------------------------------------------------

                const oModel = oPage.getModel();

                if (!oModel) {
                    throw new Error(
                        "OData V4 model not found."
                    );
                }

                // --------------------------------------------------
                // 3. Call unbound CAP action
                // --------------------------------------------------

                const oOperation = oModel.bindContext(
                    "/syncServiceLogs(...)"
                );

                await oOperation.execute();

                // --------------------------------------------------
                // 4. Read response
                // --------------------------------------------------

                const result =
                    oOperation.getBoundContext().getObject();
                if (
                    result?.failures &&
                    result.failures.length > 0
                ) {

                    console.error(
                        "Service synchronization failures:",
                        result.failures
                    );

                    result.failures.forEach(function (failure) {

                        console.error(
                            `[${failure.api || "UNKNOWN API"}] ` +
                            `[${failure.operation || "UNKNOWN OPERATION"}] ` +
                            `${failure.environment
                                ? `[${failure.environment}] `
                                : ""
                            }` +
                            `Subaccount: ${failure.subaccountId || "N/A"
                            } ` +
                            `Error: ${failure.error || "Unknown error"
                            }`
                        );

                    });
                }


                // handle Message for sync
                if (result?.status === "RUNNING") {

                    MessageBox.information(
                        result.message ||
                        "Service synchronization is already running.",
                        {
                            title: "Synchronization In Progress"
                        }
                    );

                } else if (result?.status === "PARTIAL_SUCCESS") {

                    MessageBox.warning(
                        result.message ||
                        "Service synchronization completed with some failures.",
                        {
                            title: "Service Synchronization Completed with Warnings"
                        }
                    );

                    oModel.refresh("$auto");

                } else if (result?.status === "SUCCESS") {

                    MessageToast.show(
                        result.message ||
                        "Service synchronization completed successfully."
                    );

                    oModel.refresh("$auto");

                } else if (result?.status === "FAILED") {

                    MessageBox.error(
                        result.message ||
                        "Service synchronization failed.",
                        {
                            title: "Service Synchronization Failed"
                        }
                    );

                } else {

                    MessageBox.warning(
                        result.message ||
                        "Unexpected synchronization status received.",
                        {
                            title: "Unexpected Synchronization Status"
                        }
                    );
                }

            } catch (err) {

                MessageBox.error(
                    err.message ||
                    "Synchronization failed."
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