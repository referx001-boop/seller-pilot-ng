/** Inline SVG icon set (stroke icons, 24px grid). No external icon fonts or CDNs. */
const paths: Record<string, string> = {
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z',
  bag: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  invoice: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  chevron: 'M9 18l6-6-6-6',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  cpu: 'M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
};

export function Icon({ name, size = 20, className, title }: { name: keyof typeof paths | 'whatsapp' | 'paypal'; size?: number; className?: string; title?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', className: `icon ${className ?? ''}`, 'aria-hidden': title ? undefined : true, role: title ? 'img' : undefined } as const;
  if (name === 'whatsapp')
    return (
      <svg {...common} fill="currentColor">{title && <title>{title}</title>}
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z" />
      </svg>
    );
  if (name === 'paypal')
    return (
      <svg {...common} fill="currentColor">{title && <title>{title}</title>}
        <path d="M8.3 21H4.6a.5.5 0 0 1-.5-.6L6.8 3.5A1 1 0 0 1 7.8 2.7h6.4c3.3 0 5.3 1.7 4.8 4.8-.6 3.7-3 5.3-6.4 5.3H10a.8.8 0 0 0-.8.7L8.3 21z" opacity=".55" />
        <path d="M19.7 8.2c-.7 3.9-3.3 5.6-6.9 5.6h-1.6a.8.8 0 0 0-.8.7l-.9 5.8-.2 1.2a.5.5 0 0 0 .5.5h3a.8.8 0 0 0 .8-.6l.6-3.8a.8.8 0 0 1 .8-.7h.5c3 0 5.2-1.2 5.8-4.7.3-1.5.1-2.8-.6-3.6z" />
      </svg>
    );
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {title && <title>{title}</title>}
      <path d={paths[name]} />
    </svg>
  );
}
