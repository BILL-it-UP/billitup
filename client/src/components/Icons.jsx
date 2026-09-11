// Small, consistent line-icon set for the sidebar and stat tiles — no icon
// library dependency, just inline SVG at a shared stroke weight so they read
// as one family. Each takes an optional `size` (default 18) and inherits
// color from CSS (currentColor), so active/hover states are pure CSS.
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconInvoice({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M6 2.5h9l3 3V21a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
      <path d="M15 2.5V5.5a.5.5 0 0 0 .5.5H18" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </svg>
  );
}

export function IconQuote({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M6 2.5h9l3 3V21a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
      <path d="M15 2.5V5.5a.5.5 0 0 0 .5.5H18" />
      <path d="M8.5 10.5 10 12l-1.5 1.5M12.5 13.5h3" />
    </svg>
  );
}

export function IconCreditNote({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 10a8 8 0 1 1 2.1 5.4" />
      <path d="M4 15v-4.5h4.5" />
      <path d="M9.5 12.5c.4-1 1.3-1.5 2.4-1.5 1.4 0 2.4.8 2.4 2s-1 2-2.4 2c-1.1 0-2-.5-2.4-1.5" />
    </svg>
  );
}

export function IconRecurring({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M3.5 8.5a8 8 0 0 1 14.5-3M20.5 15.5a8 8 0 0 1-14.5 3" />
      <path d="M14.5 5h3.5V1.5M9.5 19H6v3.5" />
    </svg>
  );
}

export function IconCustomers({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M15.5 5.2c1.5.4 2.5 1.7 2.5 3.2s-1 2.8-2.5 3.2M19 14.8c2 .5 3.5 2 3.5 4.2" />
    </svg>
  );
}

export function IconItems({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M3.5 7.5 12 3l8.5 4.5L12 12 3.5 7.5Z" />
      <path d="M3.5 7.5V16L12 20.5V12M20.5 7.5V16L12 20.5" />
    </svg>
  );
}

export function IconReports({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 20.5h16" />
      <rect x="5.5" y="13" width="3.2" height="7.5" rx="0.6" />
      <rect x="10.4" y="8.5" width="3.2" height="12" rx="0.6" />
      <rect x="15.3" y="4" width="3.2" height="16.5" rx="0.6" />
    </svg>
  );
}

export function IconSettings({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3" />
    </svg>
  );
}

export function IconDashboard({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="1" />
      <rect x="13" y="10.5" width="7.5" height="10" rx="1" />
      <rect x="3.5" y="13.5" width="7.5" height="7" rx="1" />
    </svg>
  );
}

export function IconLogout({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M9 20.5H5.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1H9" />
      <path d="M15.5 16.5 20.5 12l-5-4.5M20.5 12h-11" />
    </svg>
  );
}

export function IconChevron({ size = 18, direction = "left" }) {
  const rotate = { left: 0, right: 180, up: 90, down: -90 }[direction];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${rotate}deg)` }} {...base}>
      <path d="M15 5.5 8.5 12l6.5 6.5" />
    </svg>
  );
}
