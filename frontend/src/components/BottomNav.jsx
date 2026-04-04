import { NavLink } from 'react-router-dom';

const navItems = [
  {
    label: 'Dashboard',
    path: '/',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h7v6H4zm0 8h7v6H4zm9-8h7v10h-7zm0 12h7v2h-7z" />
      </svg>
    ),
  },
  {
    label: 'Command',
    path: '/command',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12l5-5v3h11v4H9v3z" />
      </svg>
    ),
  },
  {
    label: 'Console',
    path: '/console',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16v12H4zm3 3 3 3-3 3m5 0h5" />
      </svg>
    ),
  },
];

function BottomNav() {
  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            isActive ? 'bottom-nav-link is-active' : 'bottom-nav-link'
          }
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;
