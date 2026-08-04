using auditLoggingAndReportingService as service from '../../srv/service';

// Add labels to fields
annotate service.UserAuditReports with {
    system @(Common.Label : 'System');
    timestamp @(Common.Label : 'Timestamp (UTC)');
    eventType @(Common.Label : 'Event Type');
    event @(Common.Label : 'Event');
    userId @(Common.Label : 'User ID');
    userName @(Common.Label : 'User Name');
    userType @(Common.Label : 'User Type');
    roleCollection @(Common.Label : 'Role Collection');
    fieldChanged @(Common.Label : 'Field Changed');
    oldValue @(Common.Label : 'Old Value');
    newValue @(Common.Label : 'New Value');
    performedBy @(Common.Label : 'Performed By');
    userRole @(Common.Label : 'User Role');
    status @(Common.Label : 'Status');
    subaccount @(Common.Label : 'Subaccount');
};

// Add value help for filter fields
annotate service.UserAuditReports with {
    system @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'UserSystemVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : system,
                    ValueListProperty : 'system'
                }
            ]
        }
    );

    eventType @(Common.ValueList : {
        CollectionPath : 'UserEventTypeVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : eventType,
                ValueListProperty : 'eventType'
            }
        ]
    });
    
    event @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'UserEventVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : event,
                    ValueListProperty : 'event'
                }
            ]
        }
    );
    
    userId @(Common.ValueList : {
        CollectionPath : 'UserUserIdVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : userId,
                ValueListProperty : 'userId'
            }
        ]
    });
    
    userName @(Common.ValueList : {
        CollectionPath : 'UserUserNameVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : userName,
                ValueListProperty : 'userName'
            }
        ]
    });
    
    status @(Common.ValueList : {
        CollectionPath : 'UserStatusVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : status,
                ValueListProperty : 'status'
            }
        ]
    });
    
    subaccount @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'UserSubaccountVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : subaccount,
                    ValueListProperty : 'subaccount'
                }
            ]
        }
    );
};

annotate service.UserAuditReports with @(
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
        event,
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
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Value : system,
            },
            {
                $Type : 'UI.DataField',
                Value : timestamp,
            },
            {
                $Type : 'UI.DataField',
                Value : eventType,
            },
            {
                $Type : 'UI.DataField',
                Value : event,
            },
            {
                $Type : 'UI.DataField',
                Value : userId,
            },
            {
                $Type : 'UI.DataField',
                Value : userName,
            },
            {
                $Type : 'UI.DataField',
                Value : userType,
            },
            {
                $Type : 'UI.DataField',
                Value : roleCollection,
            },
            {
                $Type : 'UI.DataField',
                Value : fieldChanged,
            },
            {
                $Type : 'UI.DataField',
                Value : oldValue,
            },
            {
                $Type : 'UI.DataField',
                Value : newValue,
            },
            {
                $Type : 'UI.DataField',
                Value : performedBy,
            },
            {
                $Type : 'UI.DataField',
                Value : userRole,
            },
            {
                $Type : 'UI.DataField',
                Value : status,
            },
            {
                $Type : 'UI.DataField',
                Value : subaccount,
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Value : system,
            ![@HTML5.CssDefaults] : { width : '8%' }
        },
        {
            $Type : 'UI.DataField',
            Value : userId,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : userName,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : userType,
            ![@HTML5.CssDefaults] : { width : '7%' }
        },
        {
            $Type : 'UI.DataField',
            Value : roleCollection,
            ![@HTML5.CssDefaults] : { width : '9%' }
        },
        {
            $Type : 'UI.DataField',
            Value : eventType,
            ![@HTML5.CssDefaults] : { width : '8%' }
        },
        {
            $Type : 'UI.DataField',
            Value : event,
            ![@HTML5.CssDefaults] : { width : '8%' }
        },
        {
            $Type : 'UI.DataField',
            Value : fieldChanged,
            ![@HTML5.CssDefaults] : { width : '8%' }
        },
        {
            $Type : 'UI.DataField',
            Value : oldValue,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : newValue,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : performedBy,
            ![@HTML5.CssDefaults] : { width : '9%' }
        },
        {
            $Type : 'UI.DataField',
            Value : userRole,
            ![@HTML5.CssDefaults] : { width : '7%' }
        },
        {
            $Type : 'UI.DataField',
            Value : subaccount,
            ![@HTML5.CssDefaults] : { width : '7%' }
        },
        {
            $Type : 'UI.DataField',
            Value : timestamp,
            ![@HTML5.CssDefaults] : { width : '8%' }
        },
    ],
);

