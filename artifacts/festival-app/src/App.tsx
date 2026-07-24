import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from 'wouter';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import DashboardPage from '@/pages/dashboard';
import VendorsPage from '@/pages/vendors/index';
import VendorDetailPage from '@/pages/vendors/[id]';
import SponsorsPage from '@/pages/sponsors/index';
import SponsorDetailPage from '@/pages/sponsors/[id]';
import VolunteersPage from '@/pages/volunteers/index';
import VolunteerDetailPage from '@/pages/volunteers/[id]';
import SettingsPage from '@/pages/settings';
import StaffPage from '@/pages/staff';

import ApplyVendorPage from '@/pages/public/apply-vendor';
import ApplySponsorPage from '@/pages/public/apply-sponsor';
import ApplyVolunteerPage from '@/pages/public/apply-volunteer';
import ApplySuccessPage from '@/pages/public/apply-success';

import PortalPage from '@/pages/portal/[token]';
import PortalSuccessPage from '@/pages/portal/success';

import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { CalendarDays, HandHeart, Store } from 'lucide-react';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

// RCCS palette: crimson #C8102E · navy #0C1B3F
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(350, 86%, 42%)",
    colorForeground: "hsl(224, 54%, 13%)",
    colorMutedForeground: "hsl(220, 20%, 46%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(220, 16%, 92%)",
    colorInputForeground: "hsl(224, 54%, 13%)",
    colorDanger: "hsl(0, 84%, 50%)",
    colorNeutral: "hsl(220, 16%, 88%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white w-[440px] max-w-full overflow-hidden shadow-lg border-t-4 border-t-primary rounded",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-secondary text-2xl font-bold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium text-sm",
    footerActionLink: "text-primary hover:text-primary/80 font-semibold",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-white px-2",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formFieldSuccessText: "text-green-600",
    alertText: "text-foreground",
    logoBox: "mb-4 justify-center",
    logoImage: "h-12 w-12",
    socialButtonsBlockButton: "border border-input hover:bg-muted/50 rounded",
    formButtonPrimary: "bg-primary text-white hover:bg-primary/90 shadow rounded font-semibold uppercase tracking-wide text-sm",
    formFieldInput: "flex h-9 w-full rounded border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    footerAction: "justify-center",
    dividerLine: "bg-border",
    alert: "border border-border bg-muted/30 rounded",
    otpCodeFieldInput: "border-input border rounded",
    formFieldRow: "space-y-2",
    main: "space-y-6",
  },
};

function SignInPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Navy header */}
      <div className="h-16 bg-secondary flex items-center px-8 gap-3 shadow-md">
        <img src={`${basePath}/logo.svg`} alt="Logo" className="w-9 h-9 rounded" />
        <span className="font-serif font-bold text-white text-lg tracking-wide">Romanian Festival</span>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-12 bg-background">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="h-16 bg-secondary flex items-center px-8 gap-3 shadow-md">
        <img src={`${basePath}/logo.svg`} alt="Logo" className="w-9 h-9 rounded" />
        <span className="font-serif font-bold text-white text-lg tracking-wide">Romanian Festival</span>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-12 bg-background">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      {/* Navy header — exact RCCS style */}
      <header className="bg-secondary shadow-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`}
              alt="Romanian Festival Logo"
              className="w-10 h-10 rounded"
            />
            <div>
              <div className="font-serif font-bold text-white text-sm leading-tight uppercase tracking-wider">Romanian Festival</div>
              <div className="text-white/60 text-xs tracking-wide">Preserving culture. Building community.</div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero — dark navy banner with white text, RCCS-style */}
      <section className="bg-secondary text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24 flex flex-col md:flex-row items-center gap-10 md:gap-16">
          {/* Left: text + CTA */}
          <div className="flex-1 min-w-0">
            <h1 className="font-serif text-5xl md:text-6xl font-bold leading-tight mb-6">
              Preserving Culture.<br />
              Strengthening Community.<br />
              Connecting Generations.
            </h1>
            <p className="text-white/75 text-base md:text-lg mb-10 leading-relaxed">
              Join us for a day of music,<br />
              food, and culture.<br />
              Applications are open for vendors, sponsors, and volunteers.
            </p>
            <Link href="/apply/vendor">
              <Button className="bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-widest text-sm px-8 h-12 rounded shadow-lg">
                Get Involved
              </Button>
            </Link>
          </div>

          {/* Right: hero image */}
          <div className="w-full md:w-[420px] flex-shrink-0">
            <img
              src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/hero.jpg`}
              alt="Romanian Festival"
              className="w-full h-72 md:h-[420px] object-cover object-center rounded shadow-xl"
            />
          </div>
        </div>
      </section>

      {/* Apply cards — clean white section, RCCS pattern */}
      <section className="bg-background flex-1">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="mb-10">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-secondary section-underline">
              Apply to Participate
            </h2>
            <p className="mt-5 text-muted-foreground text-base max-w-xl">
              Applications are open for this year's festival. Choose your participation type below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Sponsors — navy/blue */}
            <Link href="/apply/sponsor">
              <div className="bg-white border border-border rounded hover:shadow-md transition-all cursor-pointer group overflow-hidden">
                <div className="h-1.5 bg-secondary w-full" />
                <div className="p-8">
                  <HandHeart className="w-9 h-9 text-secondary mb-5" />
                  <h3 className="font-serif text-xl font-bold text-secondary mb-2">Sponsors</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Support the event and reach the Romanian community.
                  </p>
                  <div className="mt-5 text-secondary text-xs font-bold uppercase tracking-widest group-hover:underline">
                    Apply Now →
                  </div>
                </div>
              </div>
            </Link>

            {/* Vendors — golden yellow */}
            <Link href="/apply/vendor">
              <div className="bg-white border border-border rounded hover:shadow-md transition-all cursor-pointer group overflow-hidden">
                <div className="h-1.5 w-full" style={{ backgroundColor: "#C89A2A" }} />
                <div className="p-8">
                  <Store className="w-9 h-9 mb-5" style={{ color: "#C89A2A" }} />
                  <h3 className="font-serif text-xl font-bold text-secondary mb-2">Vendors</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Book a booth to sell your goods and food at the festival.
                  </p>
                  <div className="mt-5 text-xs font-bold uppercase tracking-widest group-hover:underline" style={{ color: "#C89A2A" }}>
                    Apply Now →
                  </div>
                </div>
              </div>
            </Link>

            {/* Volunteers — crimson red */}
            <Link href="/apply/volunteer">
              <div className="bg-white border border-border rounded hover:shadow-md transition-all cursor-pointer group overflow-hidden">
                <div className="h-1.5 bg-primary w-full" />
                <div className="p-8">
                  <CalendarDays className="w-9 h-9 text-primary mb-5" />
                  <h3 className="font-serif text-xl font-bold text-secondary mb-2">Volunteers</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Help us run the festival and make it a success.
                  </p>
                  <div className="mt-5 text-primary text-xs font-bold uppercase tracking-widest group-hover:underline">
                    Apply Now →
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-secondary text-white/60 text-xs text-center py-5 tracking-wide">
        <div>Romanian Festival &copy; {new Date().getFullYear()}</div>
        <div className="mt-2">
          <Link href="/sign-in" className="text-white/25 hover:text-white/50 transition-colors text-[10px]">
            Staff Login
          </Link>
        </div>
      </footer>
    </div>
  )
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

// Protect Admin routes
function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <Route {...rest}>
      {() => (
        <>
          <Show when="signed-in">
            <Component />
          </Show>
          <Show when="signed-out">
            <Redirect to="/" />
          </Show>
        </>
      )}
    </Route>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-4">
      <h1 className="text-8xl font-serif text-secondary font-bold mb-2">404</h1>
      <div className="w-12 h-1 bg-primary mx-auto mb-6 rounded" />
      <p className="text-xl text-muted-foreground mb-8">Page not found.</p>
      <Link href="/">
        <Button className="bg-primary hover:bg-primary/90 text-white uppercase tracking-wide text-sm font-semibold">Return Home</Button>
      </Link>
    </div>
  )
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClientLocal = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClientLocal.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClientLocal]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            
            <Route path="/apply/vendor" component={ApplyVendorPage} />
            <Route path="/apply/sponsor" component={ApplySponsorPage} />
            <Route path="/apply/volunteer" component={ApplyVolunteerPage} />
            <Route path="/apply/success" component={ApplySuccessPage} />
            
            <Route path="/portal/:token/success" component={PortalSuccessPage} />
            <Route path="/portal/:token" component={PortalPage} />

            <ProtectedRoute path="/dashboard" component={DashboardPage} />
            <ProtectedRoute path="/vendors" component={VendorsPage} />
            <ProtectedRoute path="/vendors/:id" component={VendorDetailPage} />
            <ProtectedRoute path="/sponsors" component={SponsorsPage} />
            <ProtectedRoute path="/sponsors/:id" component={SponsorDetailPage} />
            <ProtectedRoute path="/volunteers" component={VolunteersPage} />
            <ProtectedRoute path="/volunteers/:id" component={VolunteerDetailPage} />
            <ProtectedRoute path="/settings" component={SettingsPage} />
            <ProtectedRoute path="/staff" component={StaffPage} />

            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
