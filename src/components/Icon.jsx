const icons = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  bookmark: <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-4-6 4z"/>,
  coins: <><circle cx="8" cy="8" r="5"/><path d="M13 5.5a5 5 0 1 1-4.5 7.2M8 6v4l2.5 1.5M16 14h5v6h-9v-3"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  arrow: <path d="M7 17 17 7M7 7h10v10"/>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"/></>,
  right: <path d="M5 12h14M13 6l6 6-6 6"/>,
  left: <path d="M19 12H5m6 6-6-6 6-6"/>,
  messages: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M8 11h8M8 15h5"/></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M2 14h4M10 8h4M18 16h4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2z"/><path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1z"/></>,
  flask: <><path d="M9 3h6M10 3v7l-5 8.3A2.5 2.5 0 0 0 7.1 22h9.8a2.5 2.5 0 0 0 2.1-3.7L14 10V3"/><path d="M8 16h8"/></>,
  beaker: <><path d="M6 3h12M8 3v7l-4.5 8.5A2.4 2.4 0 0 0 5.6 22h12.8a2.4 2.4 0 0 0 2.1-3.5L16 10V3"/><path d="M7 16h10"/></>,
  sigma: <path d="M18 4H6l7 8-7 8h12"/>,
  atom: <><circle cx="12" cy="12" r="1"/><path d="M19.1 19.1c-1.8 1.8-6-.2-9.4-3.6s-5.4-7.6-3.6-9.4 6 .2 9.4 3.6 5.4 7.6 3.6 9.4Z"/><path d="M4.9 19.1c-1.8-1.8.2-6 3.6-9.4s7.6-5.4 9.4-3.6-.2 6-3.6 9.4-7.6 5.4-9.4 3.6Z"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
}

export default function Icon({ name, size = 19, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name] || icons.spark}
    </svg>
  )
}
