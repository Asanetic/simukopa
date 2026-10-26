// dimev3MenuConfig.js
//
// Sidebar menu for the "dimev3" app. Extended by clone-module.js: modules you
// confirm are added below, grouped by the first word of their table name
// (fuel_stations, fuel_pumps -> "Fuel"). Modules already here are never duplicated,
// and the file is copied to _recycled/ before any change - so reorder, rename,
// regroup, add dashboards or quick actions and set `roles` freely.
// Your own grouping: app/<app>/AppRoutes/menuGroups.txt  ("Sales = fuel_sales, sales_orders").

export const dimev3SidebarConfig = [

  // ============================================================
  // HOME  (added by clone-module.js)
  // ============================================================

  {
    type: "link",
    label: "Dashboard",
    icon: "fa fa-dashboard",
    href: (routes) => `${routes.dimev3}/dashboard/main`,
    roles: []
  },


  // ============================================================
  // CLIENTS  (added by clone-module.js)
  // ============================================================

  {
    type: "submenu",
    label: "Clients",
    icon: "fa fa-users",
    roles: [],
    items: [

      {
        label: "Add New Client",
        href: (routes) => `${routes.dimev3}/clients/profile`,
        roles: []
      },
      {
        label: "Manage Clients",
        href: (routes) => `${routes.dimev3}/clients/list?setgv=sheet`,
        roles: []
      },
      {
        label: "View Clients",
        href: (routes) => `${routes.dimev3}/clients/list?setgv=table`,
        roles: []
      },
      {
        label: "Import Clients",
        href: (routes) => `${routes.dimev3}/clients/import`,
        roles: []
      }

    ]
  },


  // ============================================================
  // DEVICES  (menu group - added by clone-module.js)
  // ============================================================

  {
    type: "submenu",
    label: "Devices",
    icon: "fa fa-microchip",
    roles: [],
    items: [
      // <menu-group:device>
      {
        type: "submenu",
        label: "Allocations",
        icon: "fa fa-microchip",
        roles: [],
        items: [
          {
            label: "Add New Allocation",
            href: (routes) => `${routes.dimev3}/devicesallocations/profile`,
            roles: []
          },
          {
            label: "Manage Allocations",
            href: (routes) => `${routes.dimev3}/devicesallocations/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View Allocations",
            href: (routes) => `${routes.dimev3}/devicesallocations/list?setgv=table`,
            roles: []
          },
          {
            label: "Import Allocations",
            href: (routes) => `${routes.dimev3}/devicesallocations/import`,
            roles: []
          }
        ]
      },
      {
        type: "submenu",
        label: "List",
        icon: "fa fa-microchip",
        roles: [],
        items: [
          {
            label: "Add New List",
            href: (routes) => `${routes.dimev3}/deviceslist/profile`,
            roles: []
          },
          {
            label: "Manage List",
            href: (routes) => `${routes.dimev3}/deviceslist/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View List",
            href: (routes) => `${routes.dimev3}/deviceslist/list?setgv=table`,
            roles: []
          },
          {
            label: "Import List",
            href: (routes) => `${routes.dimev3}/deviceslist/import`,
            roles: []
          }
        ]
      },
      // </menu-group:device>
    ]
  },
  

  // ============================================================
  // LOANS  (menu group - added by clone-module.js)
  // ============================================================

  {
    type: "submenu",
    label: "Loans",
    icon: "fa fa-money",
    roles: [],
    items: [
      // <menu-group:loan>
      {
        type: "submenu",
        label: "Loans",
        icon: "fa fa-money",
        roles: [],
        items: [
          {
            label: "Add New Loan",
            href: (routes) => `${routes.dimev3}/loans/profile`,
            roles: []
          },
          {
            label: "Manage Loans",
            href: (routes) => `${routes.dimev3}/loans/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View Loans",
            href: (routes) => `${routes.dimev3}/loans/list?setgv=table`,
            roles: []
          },
          {
            label: "Import Loans",
            href: (routes) => `${routes.dimev3}/loans/import`,
            roles: []
          }
        ]
      },

      {
        type: "submenu",
        label: "Plans",
        icon: "fa fa-money",
        roles: [],
        items: [
          {
            label: "Add New Plan",
            href: (routes) => `${routes.dimev3}/loansplans/profile`,
            roles: []
          },
          {
            label: "Manage Plans",
            href: (routes) => `${routes.dimev3}/loansplans/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View Plans",
            href: (routes) => `${routes.dimev3}/loansplans/list?setgv=table`,
            roles: []
          },
          {
            label: "Import Plans",
            href: (routes) => `${routes.dimev3}/loansplans/import`,
            roles: []
          }
        ]
      },
      {
        type: "submenu",
        label: "Repayments",
        icon: "fa fa-money",
        roles: [],
        items: [
          {
            label: "Add New Repayment",
            href: (routes) => `${routes.dimev3}/loansrepayments/profile`,
            roles: []
          },
          {
            label: "Manage Repayments",
            href: (routes) => `${routes.dimev3}/loansrepayments/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View Repayments",
            href: (routes) => `${routes.dimev3}/loansrepayments/list?setgv=table`,
            roles: []
          },
          {
            label: "Import Repayments",
            href: (routes) => `${routes.dimev3}/loansrepayments/import`,
            roles: []
          }
        ]
      },
      // </menu-group:loan>
    ]
  },


  // ============================================================
  // PAYTRIGGER  (menu group - added by clone-module.js)
  // ============================================================

  {
    type: "submenu",
    label: "Paytrigger",
    icon: "fa fa-bolt",
    roles: [],
    items: [
      // <menu-group:paytrigger>
      {
        type: "submenu",
        label: "Logs",
        icon: "fa fa-history",
        roles: [],
        items: [
          {
            label: "Add New Log",
            href: (routes) => `${routes.dimev3}/paytriggerlogs/profile`,
            roles: []
          },
          {
            label: "Manage Logs",
            href: (routes) => `${routes.dimev3}/paytriggerlogs/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View Logs",
            href: (routes) => `${routes.dimev3}/paytriggerlogs/list?setgv=table`,
            roles: []
          },
          {
            label: "Import Logs",
            href: (routes) => `${routes.dimev3}/paytriggerlogs/import`,
            roles: []
          }
        ]
      },
      {
        type: "submenu",
        label: "Settings",
        icon: "fa fa-cog",
        roles: [],
        items: [
          {
            label: "Add New Setting",
            href: (routes) => `${routes.dimev3}/paytriggersettings/profile`,
            roles: []
          },
          {
            label: "Manage Settings",
            href: (routes) => `${routes.dimev3}/paytriggersettings/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View Settings",
            href: (routes) => `${routes.dimev3}/paytriggersettings/list?setgv=table`,
            roles: []
          },
          {
            label: "Import Settings",
            href: (routes) => `${routes.dimev3}/paytriggersettings/import`,
            roles: []
          }
        ]
      },
      // </menu-group:paytrigger>
    ]
  },

  // ============================================================
  // REMINDERS  (menu group - added by clone-module.js)
  // ============================================================

  {
    type: "submenu",
    label: "Reminders",
    icon: "fa fa-bell",
    roles: [],
    items: [
      // <menu-group:reminder>
      {
        type: "submenu",
        label: "History",
        icon: "fa fa-history",
        roles: [],
        items: [
          {
            label: "Add New History",
            href: (routes) => `${routes.dimev3}/remindershistory/profile`,
            roles: []
          },
          {
            label: "Manage History",
            href: (routes) => `${routes.dimev3}/remindershistory/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View History",
            href: (routes) => `${routes.dimev3}/remindershistory/list?setgv=table`,
            roles: []
          },
          {
            label: "Import History",
            href: (routes) => `${routes.dimev3}/remindershistory/import`,
            roles: []
          }
        ]
      },
      {
        type: "submenu",
        label: "Templates",
        icon: "fa fa-circle-o",
        roles: [],
        items: [
          {
            label: "Add New Template",
            href: (routes) => `${routes.dimev3}/reminderstemplates/profile`,
            roles: []
          },
          {
            label: "Manage Templates",
            href: (routes) => `${routes.dimev3}/reminderstemplates/list?setgv=sheet`,
            roles: []
          },
          {
            label: "View Templates",
            href: (routes) => `${routes.dimev3}/reminderstemplates/list?setgv=table`,
            roles: []
          },
          {
            label: "Import Templates",
            href: (routes) => `${routes.dimev3}/reminderstemplates/import`,
            roles: []
          }
        ]
      },
      // </menu-group:reminder>
    ]
  },

  // ============================================================
  // SYSTEM SETTINGS  (added by clone-module.js)
  // ============================================================

  {
    type: "submenu",
    label: "System settings",
    icon: "fa fa-cog",
    roles: [],
    items: [

      {
        label: "Add New System setting",
        href: (routes) => `${routes.dimev3}/systemsettings/profile`,
        roles: []
      },
      {
        label: "Manage System settings",
        href: (routes) => `${routes.dimev3}/systemsettings/list?setgv=sheet`,
        roles: []
      },
      {
        label: "View System settings",
        href: (routes) => `${routes.dimev3}/systemsettings/list?setgv=table`,
        roles: []
      },
      {
        label: "Import System settings",
        href: (routes) => `${routes.dimev3}/systemsettings/import`,
        roles: []
      }

    ]
  },

  // ============================================================
  // REPORTS  (added by gen-report.js)
  // ============================================================

  {
    type: "submenu",
    label: "Reports",
    icon: "fa fa-bar-chart",
    roles: [],
    items: [

      {
        type: "submenu",
        label: "Loans",
        roles: [],
        items: [
          {
            label: "Loans Performance",
            href: (routes) => `${routes.dimev3}/reports/loans/loans/list`,
            roles: []
          },
          {
            label: "Monthly Loan Analysis",
            href: (routes) => `${routes.dimev3}/reports/loans/monthlyloans/list`,
            roles: []
          },
          {
            label: "Lending Growth Forecast",
            href: (routes) => `${routes.dimev3}/reports/loans/lendingforecast/list`,
            roles: []
          }
          // gen-report:group:loans:end
        ]
      },
      {
        type: "submenu",
        label: "Devices",
        roles: [],
        items: [
          {
            label: "Device Allocations",
            href: (routes) => `${routes.dimev3}/reports/devices/allocations/list`,
            roles: []
          },
          {
            label: "Device Model and Loan Analysis",
            href: (routes) => `${routes.dimev3}/reports/devices/devicemodels/list`,
            roles: []
          }
          // gen-report:group:devices:end
        ]
      },
      {
        type: "submenu",
        label: "Repayments",
        roles: [],
        items: [
          {
            label: "Repayment History",
            href: (routes) => `${routes.dimev3}/reports/repayments/repayments/list`,
            roles: []
          },
          {
            label: "Repayments by Loan",
            href: (routes) => `${routes.dimev3}/reports/repayments/repaymentbyloan/list`,
            roles: []
          }
          // gen-report:group:repayments:end
        ]
      },
      {
        type: "submenu",
        label: "Clients",
        roles: [],
        items: [
          {
            label: "Client Repayment Analysis",
            href: (routes) => `${routes.dimev3}/reports/clients/clientrepayments/list`,
            roles: []
          }
          // gen-report:group:clients:end
        ]
      }
      // gen-report:reports:end

    ]
  }
];
