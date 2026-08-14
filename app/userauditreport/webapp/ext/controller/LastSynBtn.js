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
        lastSyncFunction: async function(oContext, aSelectedContexts) {
             const oBusyDialog = new BusyDialog({
                title: "Loading",
                text: "Fetching synchronization status..."
            });
             try {
                  oBusyDialog.open();
                const oPage = sap.ui.getCore().byId(
                    "userauditreport::UserAuditReportsList"
                );

                if (!oPage) {
                    throw new Error(
                        "User Audit  Report page not found."
                    );
                }
                const oModel = oPage.getModel();

                if (!oModel) {
                    throw new Error(
                        "OData V4 model not found."
                    );
                }
                const oOperation = oModel.bindContext(
                    "/getUserAuditStatus(...)"
                );

                await oOperation.execute();
                const data =
                    oOperation.getBoundContext().getObject();
                const status =
                    data?.lastSyncStatus || "-";

                const message =
                    data?.message || "-";

                 let formattedLastRun = "-";
                if (data?.lastRunAt) {
                    const date =
                        new Date(data.lastRunAt);
                    formattedLastRun =
                        new Intl.DateTimeFormat(
                            undefined,
                            {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false
                            }
                        ).format(date);
                }

                let formattedLastSync = "-";
                if (data?.lastSyncAt) {
                    const date =
                        new Date(data.lastSyncAt);
                    formattedLastSync =
                        new Intl.DateTimeFormat(
                            undefined,
                            {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false
                            }
                        ).format(date);
                }
                MessageBox.information(

                    "Status : " + status +

                    "\n\nLast Run : " + formattedLastRun +

                    "\n\nLast Successful Sync : " +
                    formattedLastSync +

                    "\n\nMessage : " + message,

                    {
                        title:
                            "User Audit Synchronization"
                    }
                );
            } catch (err) {

                console.error(
                    "Unable to fetch synchronization status:",
                    err
                );

                MessageBox.error(
                    err.message ||
                    "Unable to fetch synchronization status."
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
