// sap.ui.define([
//     "sap/m/MessageToast",
//     "sap/m/MessageBox"
// ], function(MessageToast,MessageBox) {
//     'use strict';

//     return {
//         /**
//          * Generated event handler.
//          *
//          * @param oContext the context of the page on which the event was fired. `undefined` for list report page.
//          * @param aSelectedContexts the selected contexts of the table rows.
//          */
//         SyncRoleLogs: async function(oContext, aSelectedContexts) {
//             try {

//                 // --------------------------------------------------
//                 // 1. Call CAP action
//                 // --------------------------------------------------

//                 const response = await fetch(
//                     "/odata/v4/audit-logging-and-reporting/syncRoleLogs",
//                     {
//                         method: "POST",
//                         headers: {
//                             "Content-Type": "application/json"
//                         },
//                         body: JSON.stringify({})
//                     }
//                 );

//                 if (!response.ok) {
//                     const errorText = await response.text();
//                     throw new Error(
//                         errorText || "Synchronization failed."
//                     );
//                 }

//                 // --------------------------------------------------
//                 // 2. Read response
//                 // --------------------------------------------------

//                 const result = await response.json();

//                 MessageToast.show(
//                     result.value ||
//                     "Synchronization completed successfully."
//                 );

//                 // --------------------------------------------------
//                 // 3. Refresh Fiori Elements List Report
//                 // --------------------------------------------------

//                 const oPage = sap.ui.getCore().byId(
//                      "rolesauditreport::RoleAuditReportsList"
//                 );

//                 if (!oPage) {
//                     console.error(
//                         "Role Audit List Report page not found."
//                     );
//                     return;
//                 }

//                 const oModel = oPage.getModel();

//                 if (oModel) {
//                     oModel.refresh("$auto");
//                 }

//             } catch (err) {

//                 console.error(
//                     "Synchronization error:",
//                     err
//                 );

//                 MessageBox.error(
//                     err.message ||
//                     "Synchronization failed."
//                 );
//             }
//         }
//     };
// });
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
  "sap/m/BusyDialog"
], function (MessageToast, MessageBox,BusyDialog) {
    "use strict";

    return {

        SyncRoleLogs: async function (oContext, aSelectedContexts) {
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
                    "rolesauditreport::RoleAuditReportsList"
                );

                if (!oPage) {
                    throw new Error(
                        "Role Audit List Report page not found."
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
                    "/syncRoleLogs(...)"
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
                        "Role synchronization failures:",
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
               if (
                    oResult?.status === "PARTIAL_SUCCESS"
                ) {

                    MessageBox.warning(
                        oResult?.message ||
                        "Role synchronization completed with some failures.",
                        {
                            title:
                                "Role Synchronization Completed with Warnings"
                        }
                    );

                } else {

                    MessageToast.show(
                        oResult?.message ||
                        "Role synchronization completed successfully."
                    );
                }


                // --------------------------------------------------
                // 6. Refresh List Report
                // --------------------------------------------------

                oModel.refresh("$auto");

            } catch (err) {

                console.error(
                    "syncRoleLogs failed:",
                    err
                );

                MessageBox.error(
                    err.message ||
                    "Role synchronization failed."
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