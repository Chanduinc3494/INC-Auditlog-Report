using auditLoggingAndReportingService as service from '../../srv/service';

// Add labels to fields
annotate service.ServiceAuditReports with {
    system        @(Common.Label : 'System');
    subaccount    @(Common.Label : 'Subaccount');
    serviceName   @(Common.Label : 'Service Name');
    planName      @(Common.Label : 'Plan Name');
    status        @(Common.Label : 'Status');
    createdOn     @(Common.Label : 'Created On');
    createdBy     @(Common.Label : 'Created By');
    changedOn     @(Common.Label : 'Changed On');
    changedBy     @(Common.Label : 'Changed By');
};

// Add value help for filter fields
annotate service.ServiceAuditReports with {
    system @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ServiceSystemVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : system,
                    ValueListProperty : 'system'
                }
            ]
        }
    );

    subaccount @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ServiceSubaccountVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : subaccount,
                    ValueListProperty : 'subaccount'
                }
            ]
        }
    );
    
    serviceName @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ServiceNameVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : serviceName,
                    ValueListProperty : 'serviceName'
                }
            ]
        }
    );
    
    planName @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ServicePlanVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : planName,
                    ValueListProperty : 'planName'
                }
            ]
        }
    );
    
    status @(Common.ValueList : {
        CollectionPath : 'ServiceStatusVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : status,
                ValueListProperty : 'status'
            }
        ]
    });
    
    createdBy @(Common.ValueList : {
        CollectionPath : 'ServiceCreatedByVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : createdBy,
                ValueListProperty : 'createdBy'
            }
        ]
    });
    
    changedBy @(Common.ValueList : {
        CollectionPath : 'ServiceChangedByVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : changedBy,
                ValueListProperty : 'changedBy'
            }
        ]
    });
};

annotate service.ServiceAuditReports with @(
    UI.HeaderInfo : {
        TypeName : 'Result',
        TypeNamePlural : 'Results'
    },
    Capabilities : {
        DeleteRestrictions : { Deletable : false },
        InsertRestrictions : { Insertable : false },
        UpdateRestrictions : { Updatable : false }
    },
    // Add filter fields to the selection
    UI.SelectionFields : [
        system,
        subaccount,
        serviceName
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Value : system,
            ![@HTML5.CssDefaults] : { width : '11%' }
        },
        {
            $Type : 'UI.DataField',
            Value : subaccount,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
        {
            $Type : 'UI.DataField',
            Value : serviceName,
            ![@HTML5.CssDefaults] : { width : '18%' }
        },
        {
            $Type : 'UI.DataField',
            Value : status,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : createdOn,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
        {
            $Type : 'UI.DataField',
            Value : createdBy,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
        {
            $Type : 'UI.DataField',
            Value : changedOn,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
        {
            $Type : 'UI.DataField',
            Value : changedBy,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
    ],
);

