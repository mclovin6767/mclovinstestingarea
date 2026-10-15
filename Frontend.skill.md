name: frontend
description: Production-grade frontend development. Use when the user asks to build, refactor, or review frontend code — React components, Next.js pages, forms, routing, state management wiring, data fetching, accessibility, or performance optimization. Trigger on: "build a component", "create a page", "React", "Next.js", "Vue", "frontend code", "UI component", "form", "data table", "infinite scroll", "lazy loading". Pairs with: design-system.skill.md (visual tokens), state-management.skill.md (global state), animations.skill.md (motion), performance.skill.md (optimization).
This skill produces correct, maintainable, accessible, and performant frontend code. It covers component architecture, data fetching, routing, forms, and integration patterns for modern frontend frameworks.
Framework Defaults
Primary: React 18+ with TypeScript
Meta-framework: Next.js 14+ (App Router)
Styling: Tailwind CSS + CSS Modules for component-scoped styles
Component library: shadcn/ui (copy-paste, fully controlled) or Radix UI primitives
Package manager: pnpm
Adapt to the user's existing stack if specified.

Project Structure (Next.js App Router)
/app
  /layout.tsx              # Root layout (fonts, providers, metadata)
  /page.tsx                # Home page
  /(auth)
    /login/page.tsx
    /register/page.tsx
  /(dashboard)
    /layout.tsx            # Dashboard layout (sidebar, nav)
    /dashboard/page.tsx
    /settings/page.tsx
  /api
    /webhooks/route.ts
/components
  /ui                      # shadcn/ui primitives (Button, Input, etc.)
  /layout                  # Header, Sidebar, Footer
  /features                # Feature-specific components
    /users/UserCard.tsx
    /billing/PlanSelector.tsx
/hooks                     # Custom hooks
/lib                       # Utilities, API clients, helpers
/types                     # TypeScript type definitions
/stores                    # Zustand/Jotai stores
/styles                    # Global CSS, theme

Component Patterns
Server Components (Next.js App Router default)
Use for: data fetching, static content, layouts, anything without interactivity.
tsx// app/dashboard/page.tsx
import { db } from "@/lib/db";
import { UserList } from "@/components/features/users/UserList";

export default async function DashboardPage() {
  const users = await db.user.findMany({ take: 20 });
  return <UserList users={users} />;
}
Client Components
Use for: event handlers, browser APIs, hooks, real-time updates.
tsx"use client";
import { useState } from "react";

interface CounterProps {
  initialCount?: number;
}

export function Counter({ initialCount = 0 }: CounterProps) {
  const [count, setCount] = useState(initialCount);
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
Compound Components (for complex UI with shared state)
tsx// Usage: <Tabs><Tabs.List>...</Tabs.List><Tabs.Panel>...</Tabs.Panel></Tabs>
const TabsContext = createContext<TabsContextType | null>(null);

function Tabs({ children, defaultValue }: TabsProps) {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}
Tabs.List = TabsList;
Tabs.Panel = TabsPanel;

Data Fetching
Server-side (Next.js, preferred for initial data)
tsx// Fetch with caching
const data = await fetch("https://api.example.com/data", {
  next: { revalidate: 60 }, // ISR: revalidate every 60s
});

// No cache (always fresh)
const data = await fetch("...", { cache: "no-store" });
Client-side with TanStack Query
tsx// hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then(r => r.json()),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) =>
      fetch("/api/users", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
Optimistic Updates
tsxuseMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ["todos"] });
    const previous = queryClient.getQueryData(["todos"]);
    queryClient.setQueryData(["todos"], (old: Todo[]) =>
      old.map(t => t.id === newTodo.id ? { ...t, ...newTodo } : t)
    );
    return { previous };
  },
  onError: (err, _, context) => {
    queryClient.setQueryData(["todos"], context?.previous);
  },
});

Forms
React Hook Form + Zod (recommended)
tsximport { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    await signIn(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />
        {errors.email && <p role="alert">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input id="password" type="password" {...register("password")} />
        {errors.password && <p role="alert">{errors.password.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

Custom Hooks Patterns
tsx// useDebounce
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// useLocalStorage
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initial;
    } catch { return initial; }
  });
  const set = (v: T) => {
    setValue(v);
    localStorage.setItem(key, JSON.stringify(v));
  };
  return [value, set] as const;
}

// useIntersectionObserver (for infinite scroll, lazy load)
function useIntersectionObserver(ref: RefObject<Element>, options?: IntersectionObserverInit) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, options]);
  return isIntersecting;
}

Accessibility (a11y) Requirements
Every component must:

Use semantic HTML (<button>, <nav>, <main>, <section>, <article>)
Have proper ARIA labels for icon-only buttons: <button aria-label="Close dialog">
Manage focus correctly in modals/drawers (trap focus, restore on close)
Support keyboard navigation (Tab, Shift+Tab, Enter, Escape, Arrow keys for menus)
Meet WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
Announce dynamic changes via aria-live regions
Never suppress focus outlines — style them instead

tsx// Accessible dialog example
<dialog
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <h2 id="dialog-title">Confirm deletion</h2>
  <p id="dialog-description">This action cannot be undone.</p>
  ...
</dialog>

Error Boundaries
tsx"use client";
import { Component, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div role="alert">
          <h2>Something went wrong</h2>
          <pre>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

Performance Checklist

 Dynamic import heavy components: const Chart = dynamic(() => import("./Chart"), { ssr: false })
 Use React.memo on components that receive stable props but re-render often
 Use useMemo / useCallback only when profiler shows a problem (don't pre-optimize)
 Virtualize long lists: @tanstack/react-virtual or react-window
 Optimize images: Next.js <Image> with priority for LCP images
 Avoid layout shifts: set explicit width/height on images and embeds
 Bundle analyze: npx @next/bundle-analyzer


TypeScript Conventions
tsx// Props with children
interface CardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

// Discriminated unions for variants
type ButtonProps =
  | { variant: "primary"; onClick: () => void }
  | { variant: "link"; href: string };

// Generic components
function Select<T extends { id: string; label: string }>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T | null;
  onChange: (value: T) => void;
}) { ... }

Routing Patterns (Next.js)
tsx// Parallel routes for modals
app/
  @modal/
    (.)photos/[id]/page.tsx   // Intercept /photos/[id] to show modal
  photos/
    [id]/page.tsx              // Full page on direct navigate

// Route groups (no URL impact)
app/
  (marketing)/
    page.tsx                   // Marketing layout
  (app)/
    dashboard/page.tsx         // App layout

// Middleware (auth guard)
// middleware.ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get("token");
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
export const config = { matcher: ["/dashboard/:path*"] };