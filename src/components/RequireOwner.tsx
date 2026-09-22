import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';

interface Props {
  children: ReactNode;
  /** Where to send staff roles when they hit an owner-only page. Default: /pos */
  staffRedirect?: string;
}

/**
 * Wraps owner-only pages. Staff (cashiers, kitchen staff) are redirected to
 * their own screens. Owners, managers and super admins pass through.
 */
const RequireOwner = ({ children, staffRedirect }: Props) => {
  const { isLoading, user, role } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (role === 'cashier' || role === 'kitchen_staff') {
      navigate(role === 'kitchen_staff' ? '/kitchen' : (staffRedirect ?? '/pos'), { replace: true });
    }
  }, [isLoading, user, role, navigate, staffRedirect]);

  // Never block on the loader. `isLoading` is bounded by a short timeout, and an
// unknown role (server unreachable) must NOT leave the screen stuck on an
// eternal "Loading…" — real authorization is enforced server-side via RLS, so
// the gate here is UX only. With a signed-in user we render immediately;
// offline logins keep their correct role via the cached-role fallback.
  if (isLoading || !user || role === 'cashier' || role === 'kitchen_staff') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireOwner;
