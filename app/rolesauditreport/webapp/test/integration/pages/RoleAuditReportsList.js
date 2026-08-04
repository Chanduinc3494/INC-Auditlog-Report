sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'rolesauditreport',
            componentId: 'RoleAuditReportsList',
            contextPath: '/RoleAuditReports'
        },
        CustomPageDefinitions
    );
});