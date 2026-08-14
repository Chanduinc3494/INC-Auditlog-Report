sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog"
], function(MessageToast,MessageBox,BusyDialog) {
    'use strict';

    return {
        /**
         * Generated event handler.
         *
         * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
         * @param aSelectedContexts the selected contexts of the table rows.
         */
        SyncBtnFunction: async function(oContext, aSelectedContexts) {
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
                      "userauditreport::UserAuditReportsList"
                );

                if (!oPage) {
                    throw new Error(
                        "User Audit Report page not found."
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
                    "/syncUserAuditLogs(...)"
                );

                // --------------------------------------------------
                // 4. Execute CAP action
                // --------------------------------------------------

                await oOperation.execute();

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
                        "User Audit synchronization failures:",
                        oResult.failures
                    );

                    oResult.failures.forEach(function (failure) {

                        console.error(
                            `[${failure.api || "UNKNOWN API"}] ` +
                            `[${failure.operation || "UNKNOWN OPERATION"}] ` +
                            `Subaccount: ${
                                failure.subaccountId || "N/A"
                            } ` +
                            `Error: ${
                                failure.error || "Unknown error"
                            }`
                        );

                    });
                }
                 if (
                    oResult?.status === "PARTIAL_SUCCESS"
                ) {

                    MessageBox.warning(
                        oResult?.message ||
                        "User Audit synchronization completed with some failures.",
                        {
                            title:
                                "User Audit Synchronization Completed with Warnings"
                        }
                    );

                } else {

                    MessageToast.show(
                        oResult?.message ||
                        "User Audit synchronization completed successfully."
                    );
                }

                // MessageToast.show(
                //     oResult?.value ||
                //     "User Logs synchronization completed successfully."
                // );

                // --------------------------------------------------
                // 6. Refresh List Report
                // --------------------------------------------------

                oModel.refresh("$auto");

            } catch (err) {

                console.error(
                    "syncUserAuditLogs failed:",
                    err
                );

                MessageBox.error(
                    err.message ||
                    "User Audit synchronization failed."
                );
            }finally {

                // Always close BusyDialog
                oBusyDialog.close();

                // Destroy it after use
                oBusyDialog.destroy();
            }
        }
    };
});
