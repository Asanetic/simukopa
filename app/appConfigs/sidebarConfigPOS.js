// sidebarConfigTicketing.js
//
// Event Ticketing Management System
//
// Principles:
// - Minimal navigation
// - Group related functions
// - Action-oriented labels
// - Monitor ticket generation, payments and revenue
// - Simple enough for non-technical users

export const sidebarConfig = [

  // ============================================================
  // HOME
  // ============================================================

  {
    type: "link",
    label: "Dashboard",
    icon: "fa fa-dashboard",
    href: (routes) => `${routes.ticksy}/dashboard/main`,
    roles: []
  },

  // ============================================================
  // QUICK ACTIONS
  // ============================================================

  {
    type: "link",
    label: "Create Event",
    icon: "fa fa-calendar-plus-o",
    href: (routes) => `${routes.ticksy}/events/create`,
    roles: []
  },

  {
    type: "link",
    label: "Record Ticket Sale",
    icon: "fa fa-ticket",
    href: (routes) => `${routes.ticksy}/orders/create`,
    roles: []
  },

  {
    type: "link",
    label: "Scan Tickets",
    icon: "fa fa-qrcode",
    href: (routes) => `${routes.ticksy}/checkins/scan`,
    roles: []
  },

  // ============================================================
  // EVENTS
  // ============================================================

  {
    type: "submenu",
    label: "Events",
    icon: "fa fa-calendar",
    roles: [],
    items: [

      {
        label: "All Events",
        href: (routes) => `${routes.ticksy}/events/list?setgv=table`,
        roles: []
      },
      {
        label: "Create Event",
        href: (routes) => `${routes.ticksy}/events/create`,
        roles: []
      },
      {
        label: "Published Events",
        href: (routes) => `${routes.ticksy}/events/published`,
        roles: []
      },
      {
        label: "Cancelled Events",
        href: (routes) => `${routes.ticksy}/events/cancelled`,
        roles: []
      }

    ]
  },

  // ============================================================
  // TICKETS
  // ============================================================

  {
    type: "submenu",
    label: "Tickets",
    icon: "fa fa-ticket",
    roles: [],
    items: [

      {
        label: "Ticket Types",
        href: (routes) => `${routes.ticksy}/tickettypes/list?setgv=table`,
        roles: []
      },
      {
        label: "Issued Tickets",
        href: (routes) => `${routes.ticksy}/tickets/list?setgv=table`,
        roles: []
      },
      {
        label: "Ticket Validation",
        href: (routes) => `${routes.ticksy}/checkins/scan`,
        roles: []
      },
      {
        label: "Attendance History",
        href: (routes) => `${routes.ticksy}/checkins/history`,
        roles: []
      }

    ]
  },

  // ============================================================
  // ORDERS & CUSTOMERS
  // ============================================================

  {
    type: "submenu",
    label: "Orders & Customers",
    icon: "fa fa-shopping-cart",
    roles: [],
    items: [

      {
        label: "All Orders",
        href: (routes) => `${routes.ticksy}/orders/list?setgv=table`,
        roles: []
      },
      {
        label: "Pending Orders",
        href: (routes) => `${routes.ticksy}/orders/pending`,
        roles: []
      },
      {
        label: "Customers",
        href: (routes) => `${routes.ticksy}/customers/list?setgv=table`,
        roles: []
      },
      {
        label: "Refunds & Cancellations",
        href: (routes) => `${routes.ticksy}/orders/refunds`,
        roles: []
      }

    ]
  },

  // ============================================================
  // FINANCE
  // ============================================================

  {
    type: "submenu",
    label: "Finance",
    icon: "fa fa-money",
    roles: [],
    items: [

      {
        label: "Payments",
        href: (routes) => `${routes.ticksy}/payments/list?setgv=table`,
        roles: []
      },
      {
        label: "Payment Verification",
        href: (routes) => `${routes.ticksy}/payments/verification`,
        roles: []
      },
      {
        label: "Revenue Summary",
        href: (routes) => `${routes.ticksy}/finance/revenue`,
        roles: []
      },
      {
        label: "Payment Exceptions",
        href: (routes) => `${routes.ticksy}/payments/exceptions`,
        roles: []
      },
      {
        label: "Refund History",
        href: (routes) => `${routes.ticksy}/payments/refunds`,
        roles: []
      }

    ]
  },

  // ============================================================
  // REPORTS & ANALYTICS
  // ============================================================

  {
    type: "submenu",
    label: "Reports",
    icon: "fa fa-bar-chart",
    roles: [],
    items: [

      {
        label: "Event Performance",
        href: (routes) => `${routes.ticksy}/reports/events`,
        roles: []
      },
      {
        label: "Ticket Sales",
        href: (routes) => `${routes.ticksy}/reports/ticketsales`,
        roles: []
      },
      {
        label: "Revenue & Payments",
        href: (routes) => `${routes.ticksy}/reports/revenue`,
        roles: []
      },
      {
        label: "Attendance Report",
        href: (routes) => `${routes.ticksy}/reports/attendance`,
        roles: []
      }

    ]
  },

  // ============================================================
  // STAFF & ACCESS
  // ============================================================

  {
    type: "submenu",
    label: "Staff & Access",
    icon: "fa fa-users",
    roles: [],
    items: [

      {
        label: "Staff Accounts",
        href: (routes) => `${routes.ticksy}/staff/list?setgv=table`,
        roles: []
      },
      {
        label: "Event Staff",
        href: (routes) => `${routes.ticksy}/eventstaff/list`,
        roles: []
      },
      {
        label: "Entry Gates",
        href: (routes) => `${routes.ticksy}/gates/list`,
        roles: []
      }

    ]
  },

  // ============================================================
  // SETTINGS
  // ============================================================

  {
    type: "submenu",
    label: "Settings",
    icon: "fa fa-cog",
    roles: [],
    items: [

      {
        label: "Organiser Profile",
        href: (routes) => `${routes.ticksy}/organiserprofile`,
        roles: []
      },
      {
        label: "Payment Channels",
        href: (routes) => `${routes.ticksy}/settings/payments`,
        roles: []
      },
      {
        label: "Ticket Settings",
        href: (routes) => `${routes.ticksy}/settings/tickets`,
        roles: []
      },
      {
        label: "Notifications",
        href: (routes) => `${routes.ticksy}/settings/notifications`,
        roles: []
      },
      {
        label: "Interface Settings",
        href: (routes) => `${routes.ticksy}/settings`,
        roles: []
      }

    ]
  }

];