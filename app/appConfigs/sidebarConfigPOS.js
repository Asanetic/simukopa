// sidebarConfigPOS.js
//
// Simu ya Mkopo
// Lipa Mdogo Mdogo / Device Financing Management
//
// Core business flow:
//
// Customer
//    ↓
// Application
//    ↓
// Device + Payment Plan
//    ↓
// Allocation
//    ↓
// Active Contract
//    ↓
// Daily Payments
//    ↓
// Reminders / Collections
//    ↓
// Device Lock / Unlock
//    ↓
// Completion / Recovery
//

import { mosyToday } from "../MosyUtils/hiveUtils";

export const sidebarConfig = [

  // =========================================================
  // DASHBOARD
  // =========================================================

  {
    type: "link",
    label: "Dashboard",
    icon: "fa fa-dashboard",
    href: (routes) => `${routes.simukopa}/dashboard/main`,
    roles: []
  },


  // =========================================================
  // TODAY / ACTION CENTER
  // =========================================================

  {
    type: "submenu",
    label: "Today",
    icon: "fa fa-bolt",
    roles: [],
    items: [
      {
        label: "Today's Collections",
        href: (routes) => `${routes.simukopa}/payments/list`,
        roles: []
      },
      {
        label: "Overdue Customers",
        href: (routes) => `${routes.simukopa}/loanapplications/list?nextBillingDate_below=${btoa(mosyToday(true))}`,
        roles: []
      },
      {
        label: "Devices at Risk",
        href: (routes) => `${routes.simukopa}/loanapplications/list?nextBillingDate_below=${btoa(mosyToday(true))}`,
        roles: []
      },
      {
        label: "Locked Devices",
        href: (routes) => `${routes.simukopa}/phones/list?status=${btoa('LOCKED')}`,
        roles: []
      }
    ],
  },


  // =========================================================
  // CUSTOMERS
  // =========================================================

  {
    type: "submenu",
    label: "Customers",
    icon: "fa fa-users",
    roles: [],
    items: [
      {
        label: "New Customer",
        href: (routes) => `${routes.simukopa}/clients/profile`,
        roles: []
      },
      {
        label: "Customer List",
        href: (routes) => `${routes.simukopa}/clients/list`,
        roles: []
      },
      {
        label: "Active Customers",
        href: (routes) => `${routes.simukopa}/clients/list?status=${btoa('ACTIVE')}`,
        roles: []
      },
      {
        label: "Inactive Customers",
        href: (routes) => `${routes.simukopa}/clients/list?status_not=${btoa('ACTIVE')}`,
        roles: []
      }      
      // {
      //   label: "Customers in Arrears",
      //   href: (routes) => `${routes.simukopa}/clients/list?status=${btoa('ARREARS')}`,
      //   roles: []
      // },
    ],
  },


  // =========================================================
  // DEVICES / INVENTORY
  // =========================================================

  {
    type: "submenu",
    label: "Devices",
    icon: "fa fa-mobile",
    roles: [],
    items: [
      {
        label: "Inventory",
        href: (routes) => `${routes.simukopa}/phones/list`,
        roles: []
      },
      {
        label: "Available Devices",
        href: (routes) => `${routes.simukopa}/phones/list?status=${btoa('AVAILABLE')}`,
        roles: []
      },
      {
        label: "Allocated Devices",
        href: (routes) => `${routes.simukopa}/phones/list?status=${btoa('ALLOCATED')}`,
        roles: []
      },
      {
        label: "Allocate Device",
        href: (routes) => `${routes.simukopa}/loanallocation`,
        roles: []
      },
      {
        label: "Allocation History",
        href: (routes) => `${routes.simukopa}/deviceallocations/list`,
        roles: []
      },
      {
        label: "Locked Devices",
        href: (routes) => `${routes.simukopa}/phones/list?status=${btoa('LOCKED')}`,
        roles: []
      },
      {
        label: "Recovered Devices",
        href: (routes) => `${routes.simukopa}/phones/list?status=${btoa('RECOVERED')}`,
        roles: []
      },
    ],
  },


  // =========================================================
  // APPLICATIONS
  // =========================================================

  {
    type: "submenu",
    label: "Applications",
    icon: "fa fa-file-text-o",
    roles: [],
    items: [
      {
        label: "New Application",
        href: (routes) => `${routes.simukopa}/loanallocation`,
        roles: []
      },
      {
        label: "Application List",
        href: (routes) => `${routes.simukopa}/loanapplications/list`,
        roles: []
      },
      {
        label: "Pending Approval",
        href: (routes) => `${routes.simukopa}/loanapplications/list?status=${btoa('PENDING')}`,
        roles: []
      },
      {
        label: "Approved",
        href: (routes) => `${routes.simukopa}/loanapplications/list?status=${btoa('APPROVED')}`,
        roles: []
      },
      {
        label: "Rejected",
        href: (routes) => `${routes.simukopa}/loanapplications/list?status=${btoa('REJECTED')}`,
        roles: []
      },
    ],
  },


  // =========================================================
  // PAYMENT PLANS
  // =========================================================

  {
    type: "submenu",
    label: "Payment Plans",
    icon: "fa fa-calendar",
    roles: [],
    items: [
      {
        label: "Plans",
        href: (routes) => `${routes.simukopa}/loanplans/list`,
        roles: []
      },
      {
        label: "Create Plan",
        href: (routes) => `${routes.simukopa}/loanplans/profile`,
        roles: []
      }
    ],
  },


  // // =========================================================
  // // ACTIVE CONTRACTS
  // // =========================================================

  // {
  //   type: "submenu",
  //   label: "Active Contracts",
  //   icon: "fa fa-file-text",
  //   roles: [],
  //   items: [
  //     {
  //       label: "All Active Contracts",
  //       href: (routes) => `${routes.simukopa}/financing/activeloans`,
  //       roles: []
  //     },
  //     {
  //       label: "Due Today",
  //       href: (routes) => `${routes.simukopa}/payments/due`,
  //       roles: []
  //     },
  //     {
  //       label: "In Arrears",
  //       href: (routes) => `${routes.simukopa}/payments/overdue`,
  //       roles: []
  //     },
  //     {
  //       label: "Completed",
  //       href: (routes) => `${routes.simukopa}/financing/completed`,
  //       roles: []
  //     },
  //   ],
  // },


  // =========================================================
  // PAYMENTS
  // =========================================================

  {
    type: "submenu",
    label: "Payments",
    icon: "fa fa-credit-card",
    roles: [],
    items: [
      {
        label: "All Payments",
        href: (routes) => `${routes.simukopa}/payments/list`,
        roles: []
      },
      {
        label: "Due Payments",
        // dateOnly=true keeps this as tight as a plain string href CAN be,
        // but a value read off the live clock can still land in SSR'd HTML
        // — AdminNav.jsx defers rendering the REAL href for anything
        // flagged dynamicHref until after mount instead (see its own
        // comment), which is what actually guarantees no hydration
        // mismatch, no matter how/when this page's HTML gets rendered.
        dynamicHref: true,
        href: (routes) => `${routes.simukopa}/loanapplications/list?nextBillingDate=${btoa(mosyToday(true))}`,
        roles: []
      },
      {
        label: "Overdue Payments",
        dynamicHref: true,
        href: (routes) => `${routes.simukopa}/loanapplications/list?nextBillingDate_below=${btoa(mosyToday(true))}`,
        roles: []
      },
      {
        label: "M-Pesa Transactions",
        href: (routes) => `${routes.simukopa}/smartpayments/list`,
        roles: []
      }
    ],
  },


  // // =========================================================
  // // COLLECTIONS
  // // =========================================================

  // {
  //   type: "submenu",
  //   label: "Collections",
  //   icon: "fa fa-phone",
  //   roles: [],
  //   items: [
  //     {
  //       label: "Collection Queue",
  //       href: (routes) => `${routes.simukopa}/collections/list`,
  //       roles: []
  //     },
  //     {
  //       label: "Overdue Accounts",
  //       href: (routes) => `${routes.simukopa}/payments/overdue`,
  //       roles: []
  //     },
  //     {
  //       label: "Payment Promises",
  //       href: (routes) => `${routes.simukopa}/collections/promises`,
  //       roles: []
  //     },
  //     {
  //       label: "Collection Calls",
  //       href: (routes) => `${routes.simukopa}/calls/list`,
  //       roles: []
  //     },
  //     {
  //       label: "Recovery",
  //       href: (routes) => `${routes.simukopa}/collections/recovery`,
  //       roles: []
  //     },
  //   ],
  // },


  // // =========================================================
  // // DEVICE CONTROL
  // // =========================================================

  // {
  //   type: "submenu",
  //   label: "Device Control",
  //   icon: "fa fa-lock",
  //   roles: [],
  //   items: [
  //     {
  //       label: "Device Status",
  //       href: (routes) => `${routes.simukopa}/devices/status`,
  //       roles: []
  //     },
  //     {
  //       label: "Locked Devices",
  //       href: (routes) => `${routes.simukopa}/devices/locked`,
  //       roles: []
  //     },
  //     {
  //       label: "Unlock Requests",
  //       href: (routes) => `${routes.simukopa}/devices/unlockrequests`,
  //       roles: []
  //     },
  //     {
  //       label: "Lock / Unlock History",
  //       href: (routes) => `${routes.simukopa}/devices/controlhistory`,
  //       roles: []
  //     },
  //   ],
  // },


  // =========================================================
  // COMMUNICATION
  // =========================================================

  {
    type: "submenu",
    label: "Communication",
    icon: "fa fa-comments",
    roles: [],
    items: [
      {
        label: "SMS",
        href: (routes) => `${routes.simukopa}/messages/list`,
        roles: []
      },
      {
        label: "Message Templates",
        href: (routes) => `${routes.simukopa}/messagetemplates/list`,
        roles: []
      },
      {
        label: "Payment Reminders",
        href: (routes) => `${routes.simukopa}/notifications/reminders`,
        roles: []
      },
      {
        label: "Message History",
        href: (routes) => `${routes.simukopa}/messages/history`,
        roles: []
      },
    ],
  },


  // =========================================================
  // SALES / AGENTS
  // =========================================================

  {
    type: "submenu",
    label: "Sales",
    icon: "fa fa-line-chart",
    roles: [],
    items: [
      {
        label: "Agents",
        href: (routes) => `${routes.simukopa}/agents/list`,
        roles: []
      },
      {
        label: "Agent Performance",
        href: (routes) => `${routes.simukopa}/agents/performance`,
        roles: []
      },
      {
        label: "Commissions",
        href: (routes) => `${routes.simukopa}/commissions/list`,
        roles: []
      },
    ],
  },


  // =========================================================
  // REPORTS
  // =========================================================

  {
    type: "submenu",
    label: "Reports",
    icon: "fa fa-bar-chart",
    roles: [],
    items: [
      {
        label: "Collection Report",
        href: (routes) => `${routes.simukopa}/reports/collections`,
        roles: []
      },
      {
        label: "Arrears Report",
        href: (routes) => `${routes.simukopa}/reports/arrears`,
        roles: []
      },
      {
        label: "Device Report",
        href: (routes) => `${routes.simukopa}/reports/devices`,
        roles: []
      },
      {
        label: "Sales Report",
        href: (routes) => `${routes.simukopa}/reports/sales`,
        roles: []
      },
      {
        label: "Payment Report",
        href: (routes) => `${routes.simukopa}/reports/payments`,
        roles: []
      },
      {
        label: "Inventory Report",
        href: (routes) => `${routes.simukopa}/reports/inventory`,
        roles: []
      },
    ],
  },


  // =========================================================
  // SYSTEM SETTINGS
  // =========================================================

  {
    type: "submenu",
    label: "System Settings",
    icon: "fa fa-cogs",
    roles: [],
    items: [
      {
        label: "Users",
        href: (routes) => `${routes.simukopa}/systemusers/list`,
        roles: []
      },
      {
        label: "Payment Plans",
        href: (routes) => `${routes.simukopa}/loanplans/list`,
        roles: []
      },
      {
        label: "Payment Settings",
        href: (routes) => `${routes.simukopa}/smartpaymentsettings/list`,
        roles: []
      },
      {
        label: "Device Lock Settings",
        href: (routes) => `${routes.simukopa}/devicesettings/list`,
        roles: []
      },
      {
        label: "Notification Settings",
        href: (routes) => `${routes.simukopa}/notifications/settings`,
        roles: []
      },
    ],
  },


  // =========================================================
  // AUDIT
  // =========================================================

  {
    type: "submenu",
    label: "Administration",
    icon: "fa fa-shield",
    roles: [],
    items: [
      {
        label: "Users",
        href: (routes) => `${routes.simukopa}/systemusers/list`,
        roles: []
      },
      {
        label: "Access Matrix",
        href: (routes) => `${routes.simukopa}/accessmatrix/list`,
        roles: []
      },
      {
        label: "Audit Logs",
        href: (routes) => `${routes.simukopa}/auditlogs/list`,
        roles: []
      },
    ],
  },

];