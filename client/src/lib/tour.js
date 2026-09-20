import { driver } from "driver.js";
import "driver.js/dist/driver.css";

// A first-time guided walkthrough, built with driver.js (MIT, zero server
// cost) rather than a hand-rolled overlay, it already handles the fiddly
// parts (positioning, keyboard nav, an element that isn't mounted yet).
//
// Each step below lives on a real page and highlights something already in
// that page's own markup via a `data-tour="..."` attribute (see Dashboard.jsx,
// Settings.jsx, Items.jsx, Customers.jsx, and NewInvoice.jsx), never a
// fabricated mockup. Because BillItUp is a client-side-routed app, moving
// from one step's page to the next is just `navigate(path)`, not a real page
// load, so the same driver.js instance and its overlay survive the whole
// tour; driver.js's own `waitForElement` option covers the moment between
// calling navigate() and the new page's target actually mounting.
//
// `ownerOnly` mirrors the exact same flag already used for nav items and
// page actions elsewhere (App.jsx's NAV_ITEMS, and the canManage checks in
// Items.jsx/Customers.jsx), a Cashier can't add items, customers, or edit
// business details, so their tour skips straight from the welcome step to
// creating an invoice instead of showing them steps that would 404 on a
// button they can't see (2026-09-20).
const ALL_STEPS = [
  {
    path: "/",
    element: "[data-tour='dashboard-welcome']",
    popover: {
      title: "Welcome to BillItUp",
      description:
        "A quick tour of the essentials before you send your first invoice. You can close this anytime and pick it up again later from Support.",
      side: "bottom",
      align: "start",
    },
  },
  {
    path: "/settings",
    ownerOnly: true,
    element: "[data-tour='settings-business-tab']",
    popover: {
      title: "Add your business details",
      description:
        "Your business name, address, and GSTIN go here first. They print on every invoice, quote, and credit note you send.",
      side: "bottom",
      align: "start",
    },
  },
  {
    path: "/items",
    ownerOnly: true,
    element: "[data-tour='items-add-button']",
    popover: {
      title: "Add what you sell",
      description:
        "Add a product or service here, with its price and tax rate. You can also add one on the fly while creating an invoice.",
      side: "bottom",
      align: "end",
    },
  },
  {
    path: "/customers",
    ownerOnly: true,
    element: "[data-tour='customers-add-button']",
    popover: {
      title: "Add your customers",
      description:
        "Add the people or businesses you bill. Their GSTIN and address get pulled onto every invoice automatically.",
      side: "bottom",
      align: "end",
    },
  },
  {
    path: "/invoices/new",
    element: "[data-tour='invoice-customer-picker']",
    popover: {
      title: "Create your first invoice",
      description:
        "Pick a customer, add a line item below, and save. From there you can email it, share a link, or download the PDF, whatever's easiest for you.",
      side: "right",
      align: "start",
    },
  },
];

const TOUR_VERSION = "v1";
const tourSeenKey = (userId) => `billitup_tour_seen_${TOUR_VERSION}_${userId}`;

// Best-effort: if localStorage is unavailable (private browsing, storage
// disabled), treat the tour as already seen rather than risk it popping up
// on every single page load.
export function hasTourBeenSeen(userId) {
  if (!userId) return true;
  try {
    return localStorage.getItem(tourSeenKey(userId)) === "1";
  } catch {
    return true;
  }
}

function markTourSeen(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(tourSeenKey(userId), "1");
  } catch {
    /* ignore, worst case the tour offers itself again next login */
  }
}

function stepsForRole(role) {
  const isOwnerOrAdmin = role === "owner" || role === "admin";
  return ALL_STEPS.filter((step) => !step.ownerOnly || isOwnerOrAdmin);
}

// `navigate` is react-router's navigate() from whichever component starts
// the tour (the Dashboard shell on first login, or the "Take a tour" button
// on Support). Marks the tour seen once it's closed for any reason, Finish,
// the close button, or Escape, so it never auto-pops again for this user;
// replaying is always available again from Support.
export function startTour(navigate, user) {
  const steps = stepsForRole(user?.role);
  if (steps.length === 0) return;

  const driverObj = driver({
    showProgress: true,
    allowClose: true,
    overlayColor: "#0f172a",
    overlayOpacity: 0.55,
    stagePadding: 6,
    waitForElement: 4000,
    skipMissingElement: true,
    popoverClass: "billitup-tour-popover",
    onDestroyed: () => markTourSeen(user?.id),
    steps: steps.map((step, i) => {
      const isFirst = i === 0;
      const isLast = i === steps.length - 1;

      return {
        element: step.element,
        popover: {
          ...step.popover,
          showButtons: isFirst ? ["next", "close"] : ["previous", "next", "close"],
          doneBtnText: "Got it",
          onNextClick: () => {
            const next = steps[i + 1];
            if (next && next.path !== window.location.pathname) navigate(next.path);
            driverObj.moveNext();
          },
          onPrevClick: () => {
            const prev = steps[i - 1];
            if (prev && prev.path !== window.location.pathname) navigate(prev.path);
            driverObj.movePrevious();
          },
          ...(isLast ? { onDoneClick: () => driverObj.destroy() } : {}),
        },
      };
    }),
  });

  if (window.location.pathname !== steps[0].path) navigate(steps[0].path);
  driverObj.drive();
}
