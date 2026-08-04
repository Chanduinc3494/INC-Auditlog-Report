sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"rolesauditreport/test/integration/pages/RoleAuditReportsList",
	"rolesauditreport/test/integration/pages/RoleAuditReportsObjectPage"
], function (JourneyRunner, RoleAuditReportsList, RoleAuditReportsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('rolesauditreport') + '/test/flp.html#app-preview',
        pages: {
			onTheRoleAuditReportsList: RoleAuditReportsList,
			onTheRoleAuditReportsObjectPage: RoleAuditReportsObjectPage
        },
        async: true
    });

    return runner;
});

