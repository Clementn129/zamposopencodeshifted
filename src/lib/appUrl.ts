// Returns the canonical app URL used for auth email redirects (password reset,
// signup confirmation, etc.). Set VITE_PUBLIC_APP_URL in your Vercel project
// to your production domain (e.g. https://your-app.vercel.app) so reset links
// point to the deployed site regardless of where the user was signed in from.
export function getAppUrl(): string {
  const envUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
