using auditLoggingAndReportingService as service from '../../srv/service';

// Add labels to fields
annotate service.ConfigurationReport with {
    system          @(Common.Label : 'System');
    userId          @(Common.Label : 'User ID');
    userRole        @(Common.Label : 'User Role');
    eventType       @(Common.Label : 'Event Type');
    btpService      @(Common.Label : 'BTP Service');
    subAccount      @(Common.Label : 'Subaccount');
    region          @(Common.Label : 'Region');
    actionPerformed @(Common.Label : 'Action Performed');
    timestamp    @(Common.Label : 'Timestamp');
};

// Add value help for filter fields
annotate service.ConfigurationReport with {
    system @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ConfigSystemVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : system,
                    ValueListProperty : 'system'
                }
            ]
        }
    );

    subAccount @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ConfigSubaccountVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : subAccount,
                    ValueListProperty : 'subAccount'
                }
            ]
        }
    );

    userRole @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ConfigRoleCollectionVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : userRole,
                    ValueListProperty : 'roleCollection'
                }
            ]
        }
    );

    eventType @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'ConfigEventVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : eventType,
                    ValueListProperty : 'event'
                }
            ]
        }
    );

    userId @(
        Common.ValueList : {
            CollectionPath : 'ConfigUserIdVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : userId,
                    ValueListProperty : 'userId'
                }
            ]
        }
    );
};

annotate service.ConfigurationReport with @(
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
        subAccount,
        userRole,
        eventType,
        userId,
        timestamp
    ],
    Capabilities.FilterRestrictions : {
        FilterExpressionRestrictions : [
            {
                Property : timestamp,
                AllowedExpressions : 'SingleRange'
            }
        ]
    },

    UI.Criticality : roleCriticality,
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Value : system,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : userId,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
        {
            $Type : 'UI.DataField',
            Value : userRole,
            Criticality : roleCriticality,
            CriticalityRepresentation : #WithoutIcon,
            ![@HTML5.CssDefaults] : { width : '11%' }
        },
        {
            $Type : 'UI.DataField',
            Value : eventType,
            ![@HTML5.CssDefaults] : { width : '11%' }
        },
        {
            $Type : 'UI.DataField',
            Value : btpService,
            ![@HTML5.CssDefaults] : { width : '12%' }
        },
        {
            $Type : 'UI.DataField',
            Value : subAccount,
            ![@HTML5.CssDefaults] : { width : '11%' }
        },
        {
            $Type : 'UI.DataField',
            Value : region,
            ![@HTML5.CssDefaults] : { width : '9%' }
        },
        {
            $Type : 'UI.DataField',
            Value : actionPerformed,
            ![@HTML5.CssDefaults] : { width : '20%' }
        },
        {
            $Type : 'UI.DataField',
            Value : timestamp,
            ![@HTML5.CssDefaults] : { width : '11%' }
        },
    ],
);
