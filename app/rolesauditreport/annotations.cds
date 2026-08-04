using auditLoggingAndReportingService as service from '../../srv/service';

// Add labels to fields
annotate service.RoleAuditReports with {
    system @(Common.Label : 'System');
    roleCollection @(Common.Label : 'Role Collection');
    event @(Common.Label : 'Event');
    timestamp @(Common.Label : 'Timestamp (UTC)');
    changedByUserId @(Common.Label : 'Changed By (User ID)');
    userRole @(Common.Label : 'User Role');
    fieldChanged @(Common.Label : 'Field');
    oldValue @(Common.Label : 'Old Value');
    newValue @(Common.Label : 'New Value');
    status @(Common.Label : 'Status');
    subaccountName @(Common.Label : 'Subaccount Name');
};

// Add value help for filter fields
annotate service.RoleAuditReports with {
    system @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'RoleSystemVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : system,
                    ValueListProperty : 'system'
                }
            ]
        }
    );

    roleCollection @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'RoleCollectionVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : roleCollection,
                    ValueListProperty : 'roleCollection'
                }
            ]
        }
    );
    
    event @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'RoleEventVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : event,
                    ValueListProperty : 'event'
                }
            ]
        }
    );
    
    status @(Common.ValueList : {
        CollectionPath : 'RoleStatusVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : status,
                ValueListProperty : 'status'
            }
        ]
    });
    
    userRole @(Common.ValueList : {
        CollectionPath : 'RoleUserRoleVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : userRole,
                ValueListProperty : 'userRole'
            }
        ]
    });

    changedByUserId @(Common.ValueList : {
        Label : 'User ID',
        CollectionPath : 'RoleChangedByVH',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : changedByUserId,
                ValueListProperty : 'changedByUserId'
            }
        ]
    });
    
    subaccountName @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'RoleSubaccountNameVH',
            Parameters : [
                {
                    $Type : 'Common.ValueListParameterInOut',
                    LocalDataProperty : subaccountName,
                    ValueListProperty : 'subaccountName'
                }
            ]
        }
    );
};

annotate service.RoleAuditReports with @(
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
        subaccountName,
        roleCollection,
        event,
        changedByUserId,
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
                Value : roleCollection,
            },
            {
                $Type : 'UI.DataField',
                Value : event,
            },
            {
                $Type : 'UI.DataField',
                Value : timestamp,
            },
            {
                $Type : 'UI.DataField',
                Value : changedByUserId,
            },
            {
                $Type : 'UI.DataField',
                Value : userRole,
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
                Value : status,
                Criticality : statusCriticality,
            },
            {
                $Type : 'UI.DataField',
                Value : subaccountName,
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
    UI.Criticality : statusCriticality,
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Value : system,
            ![@HTML5.CssDefaults] : { width : '9%' }
        },
        {
            $Type : 'UI.DataField',
            Value : roleCollection,
            ![@HTML5.CssDefaults] : { width : '12%' }
        },
        {
            $Type : 'UI.DataField',
            Value : event,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : changedByUserId,
            ![@HTML5.CssDefaults] : { width : '12%' }
        },
        {
            $Type : 'UI.DataField',
            Value : userRole,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : fieldChanged,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : oldValue,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
        {
            $Type : 'UI.DataField',
            Value : newValue,
            ![@HTML5.CssDefaults] : { width : '13%' }
        },
        {
            $Type : 'UI.DataField',
            Value : subaccountName,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
        {
            $Type : 'UI.DataField',
            Value : timestamp,
            ![@HTML5.CssDefaults] : { width : '10%' }
        },
    ],
);

