sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"userauditreport/test/integration/pages/UserAuditReportsList",
	"userauditreport/test/integration/pages/UserAuditReportsObjectPage"
], function (JourneyRunner, UserAuditReportsList, UserAuditReportsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('userauditreport') + '/test/flp.html#app-preview',
        pages: {
			onTheUserAuditReportsList: UserAuditReportsList,
			onTheUserAuditReportsObjectPage: UserAuditReportsObjectPage
        },
        async: true
    });

    return runner;
});

