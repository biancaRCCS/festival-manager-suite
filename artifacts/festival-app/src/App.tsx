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
import { CalendarDays, HandHeart, Briefcase } from 'lucide-react';

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

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(350, 75%, 45%)",
    colorForeground: "hsl(30, 40%, 15%)",
    colorMutedForeground: "hsl(30, 15%, 40%)",
    colorBackground: "hsl(40, 40%, 99%)",
    colorInput: "hsl(40, 20%, 90%)",
    colorInputForeground: "hsl(30, 40%, 15%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorNeutral: "hsl(40, 20%, 85%)",
    fontFamily: "'Outfit', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border-t-4 border-t-primary",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-primary text-2xl",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-card px-2",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-green-600",
    alertText: "text-foreground",
    logoBox: "mb-4 justify-center",
    logoImage: "h-12 w-12",
    socialButtonsBlockButton: "border border-input hover:bg-muted/50",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow",
    formFieldInput: "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    footerAction: "justify-center",
    dividerLine: "bg-border",
    alert: "border border-border bg-muted/30",
    otpCodeFieldInput: "border-input border",
    formFieldRow: "space-y-2",
    main: "space-y-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-noise bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-noise bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-noise bg-background font-sans relative">
      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="Logo" className="w-12 h-12 rounded-full shadow-md border-2 border-primary/20" />
          <span className="font-serif font-bold text-2xl text-primary drop-shadow-sm">Romanian Festival</span>
        </div>
        <Link href="/sign-in">
          <Button variant="outline" className="font-medium bg-background/50 backdrop-blur border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all shadow-sm">
            Staff Login
          </Button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center min-h-screen px-4 pt-20 relative z-10 text-center">
        <div className="max-w-3xl space-y-6">
          <h1 className="text-5xl md:text-7xl font-serif text-primary drop-shadow-sm mb-6 leading-tight">
            Celebrate Our Heritage
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Join us for a day of music, food, and culture. We are currently accepting applications for vendors, sponsors, and volunteers.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-12">
             <Link href="/apply/vendor">
               <div className="bg-card hover:bg-accent/50 border border-border rounded-xl p-8 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 group relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                 <Briefcase className="w-10 h-10 text-primary mx-auto mb-4 group-hover:scale-110 transition-transform" />
                 <h3 className="font-serif text-xl mb-2">Vendors</h3>
                 <p className="text-sm text-muted-foreground">Book a booth to sell your goods and food.</p>
               </div>
             </Link>
             <Link href="/apply/sponsor">
               <div className="bg-card hover:bg-accent/50 border border-border rounded-xl p-8 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 group relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-secondary"></div>
                 <HandHeart className="w-10 h-10 text-secondary mx-auto mb-4 group-hover:scale-110 transition-transform" />
                 <h3 className="font-serif text-xl mb-2">Sponsors</h3>
                 <p className="text-sm text-muted-foreground">Support the event and reach our community.</p>
               </div>
             </Link>
             <Link href="/apply/volunteer">
               <div className="bg-card hover:bg-accent/50 border border-border rounded-xl p-8 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 group relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
                 <CalendarDays className="w-10 h-10 text-green-500 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                 <h3 className="font-serif text-xl mb-2">Volunteers</h3>
                 <p className="text-sm text-muted-foreground">Help us run the festival smoothly.</p>
               </div>
             </Link>
          </div>
        </div>
      </main>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-secondary/10 via-transparent to-primary/5 pointer-events-none z-0"></div>
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
    <div className="min-h-screen bg-noise bg-background flex flex-col items-center justify-center text-center p-4">
      <h1 className="text-6xl font-serif text-primary mb-4">404</h1>
      <p className="text-xl text-muted-foreground mb-8">Page not found.</p>
      <Link href="/">
        <Button>Return Home</Button>
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
