// src/icons.jsx — Lucide-style stroke icons. Single source of truth.

const Icon = ({ d, size = 16, stroke = 1.6, fill = "none", children, ...rest }) => (
  <svg
    className="icn"
    width={size} height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {d ? <path d={d} /> : children}
  </svg>
);

const I = {
  // chrome
  Search:   (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>,
  Plus:     (p) => <Icon {...p} d="M12 5v14M5 12h14" />,
  Minus:    (p) => <Icon {...p} d="M5 12h14" />,
  X:        (p) => <Icon {...p} d="M18 6 6 18M6 6l12 12" />,
  Check:    (p) => <Icon {...p} d="m5 12 5 5L20 7" />,
  Chevron:  (p) => <Icon {...p} d="m6 9 6 6 6-6" />,
  ChevronR: (p) => <Icon {...p} d="m9 18 6-6-6-6" />,
  ChevronL: (p) => <Icon {...p} d="m15 18-6-6 6-6" />,
  ArrowR:   (p) => <Icon {...p} d="M5 12h14M13 6l6 6-6 6" />,
  ArrowUp:  (p) => <Icon {...p} d="M12 19V5M5 12l7-7 7 7" />,
  ArrowDn:  (p) => <Icon {...p} d="M12 5v14M5 12l7 7 7-7" />,
  More:     (p) => <Icon {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>,
  Dots:     (p) => <Icon {...p}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Icon>,
  Filter:   (p) => <Icon {...p} d="M3 6h18M6 12h12M10 18h4" />,
  Sort:     (p) => <Icon {...p} d="M3 6h13M3 12h9M3 18h5M17 8l4-4 4 4M21 4v16" />,

  // nav / sidebar
  Home:     (p) => <Icon {...p} d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-8.5Z" />,
  Folder:   (p) => <Icon {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  Cube:     (p) => <Icon {...p} d="M12 3 4 7v10l8 4 8-4V7l-8-4ZM4 7l8 4 8-4M12 11v10" />,
  Graph:    (p) => <Icon {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8 7.5l8 0M7 8l4.5 8M17 8l-4.5 8" /></Icon>,
  Book:     (p) => <Icon {...p} d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5ZM4 17h14" />,
  Plug:     (p) => <Icon {...p} d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8ZM12 16v6" />,
  Database: (p) => <Icon {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Icon>,
  Diagram:  (p) => <Icon {...p} d="M3 4h6v6H3zM15 4h6v6h-6zM9 14h6v6H9zM6 10v4M18 10v4M12 14v-4" />,
  Shield:   (p) => <Icon {...p} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />,
  Check2:   (p) => <Icon {...p} d="M9 11l3 3L20 6M12 21a9 9 0 1 1 0-18" />,
  Clock:    (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  Export:   (p) => <Icon {...p} d="M12 3v12M7 8l5-5 5 5M5 21h14" />,
  Cog:      (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>,
  Bell:     (p) => <Icon {...p} d="M6 8a6 6 0 0 1 12 0v5l1.5 3h-15L6 13V8ZM10 19a2 2 0 0 0 4 0" />,
  History:  (p) => <Icon {...p} d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />,
  Pkg:      (p) => <Icon {...p} d="m21 8-9-5-9 5 9 5 9-5ZM3 8v8l9 5 9-5V8M12 13v8" />,
  Sparkle:  (p) => <Icon {...p} d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M5.6 18.4l3.5-3.5M14.9 9.1l3.5-3.5" />,
  Layers:   (p) => <Icon {...p} d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 18l9 5 9-5" />,
  Compass:  (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m14 10-6 2 2 6 6-2-2-6Z" /></Icon>,

  // actions
  Edit:     (p) => <Icon {...p} d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />,
  Trash:    (p) => <Icon {...p} d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />,
  Save:     (p) => <Icon {...p} d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8" />,
  Copy:     (p) => <Icon {...p} d="M8 8h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2ZM4 16V4a2 2 0 0 1 2-2h10" />,
  Eye:      (p) => <Icon {...p} d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"><circle cx="12" cy="12" r="3" /></Icon>,
  Link:     (p) => <Icon {...p} d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 1 0-7-7L11.5 6M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 1 0 7 7L12.5 18" />,
  Unlink:   (p) => <Icon {...p} d="m9 15-3 3a5 5 0 0 1-7-7l3-3M15 9l3-3a5 5 0 0 1 7 7l-3 3M3 3l18 18" />,
  Play:     (p) => <Icon {...p} d="m6 4 14 8-14 8V4Z" />,
  Refresh:  (p) => <Icon {...p} d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />,
  Upload:   (p) => <Icon {...p} d="M12 16V4M6 10l6-6 6 6M5 20h14" />,
  Download: (p) => <Icon {...p} d="M12 4v12M6 14l6 6 6-6M5 4h14" />,
  ExtLink:  (p) => <Icon {...p} d="M14 4h6v6M10 14 20 4M14 10v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h9Z" />,

  // status
  Info:     (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v.01M11 12h1v4" /></Icon>,
  Warn:     (p) => <Icon {...p} d="M12 3 2 21h20L12 3ZM12 10v5M12 18v.01" />,
  Error:    (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17v.01" /></Icon>,
  Crit:     (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></Icon>,
  Spark:    (p) => <Icon {...p} d="M12 2 9.5 8 3 9.5 8 14l-1.5 7L12 17l5.5 4L16 14l5-4.5L14.5 8 12 2Z" />,

  // workflow / artifacts
  Sun:      (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>,
  Moon:     (p) => <Icon {...p} d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  Cmd:      (p) => <Icon {...p} d="M6 9V6.5a2.5 2.5 0 1 1 2.5 2.5H6Zm0 0v6m0 0v2.5A2.5 2.5 0 1 1 3.5 15.5h2.5m0 0h6m12-6V6.5a2.5 2.5 0 0 0-2.5-2.5H15V9h6Zm0 0v6m0 0v2.5a2.5 2.5 0 0 1-2.5 2.5H15v-5" />,
  Bolt:     (p) => <Icon {...p} d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />,
  GitBranch:(p) => <Icon {...p}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="6" cy="18" r="2" /><path d="M6 8v8M18 8a4 4 0 0 1-4 4H8" /></Icon>,
  Star:     (p) => <Icon {...p} d="M12 3.5 14.6 9l6 .9-4.4 4.2 1 6L12 17l-5.4 3 1-6L3.2 9.9 9.4 9 12 3.5Z" />,
  Logout:   (p) => <Icon {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  Globe:    (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" /></Icon>,
  Mail:     (p) => <Icon {...p} d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3 6l9 7 9-7" />,
  Lock:     (p) => <Icon {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 1 1 8 0v3" /></Icon>,

  // artifact-type icons (for nav and chips)
  Service:    (p) => <Icon {...p}><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></Icon>,
  ApiSpec:    (p) => <Icon {...p} d="M4 6h16M4 12h10M4 18h7M18 14l4 4-4 4" />,
  ApiEndpoint:(p) => <Icon {...p}><circle cx="6" cy="12" r="2" /><circle cx="18" cy="12" r="2" /><path d="M8 12h8" /></Icon>,
  Doc:        (p) => <Icon {...p} d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M8 13h8M8 17h6" />,
  Req:        (p) => <Icon {...p} d="M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  Sec:        (p) => <Icon {...p} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3ZM9 12l2 2 4-4" />,
  Env:        (p) => <Icon {...p} d="M21 18a4 4 0 0 1-4 4H7a5 5 0 0 1-1-9.9 6 6 0 0 1 11.7-2A4 4 0 0 1 21 14" />,
  Ext:        (p) => <Icon {...p} d="M5 4h6v6H5zM13 14h6v6h-6zM5 14h6v6H5zM13 4h6v6h-6z" />,
};

Object.assign(window, { Icon, I });
