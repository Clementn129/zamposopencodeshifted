import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';

interface Props {
  children: ReactNode;
  /** Where to send cashiers when they hit an owner-only page. Default: /pos */
  cashierRedirect?: string;
}

/**
 * Wraps owner-only pages. Cashiers are redirected to the POS.
 * Owners and super admins pass through.
 */
const RequireOwner = ({ children, cashierRedirect = '/pos' }: Props) => {
  const { isLoading, user, role } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (role === 'cashier') {
      navigate(cashierRedirect, { replace: true });
    }
  }, [isLoading, user, role, navigate, cashierRedirect]);

  if (isLoading || !user || role === 'cashier') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireOwner;
