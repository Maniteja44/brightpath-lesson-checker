import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Sparkles,
  History,
  FileX2,
  BrainCircuit,
  Workflow,
  ListChecks,
  Settings2,
  LogOut,
  GraduationCap,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/lessoniq/queries";
import { RunEngineProvider } from "./run-engine";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generate", label: "Generate Lesson", icon: Sparkles },
  { to: "/history", label: "Evaluation History", icon: History },
  { to: "/rejections", label: "Rejection Logs", icon: FileX2 },
  { to: "/memory", label: "Memory & Learning", icon: BrainCircuit },
  { to: "/workflow", label: "Workflow Architecture", icon: Workflow },
  { to: "/rubric", label: "Rubric Settings", icon: ListChecks },
  { to: "/settings", label: "API Settings", icon: Settings2 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(profileQuery);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  }

  return (
    <RunEngineProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground shadow-elevated">
                <GraduationCap className="h-4.5 w-4.5" />
              </div>
              <div className="leading-tight group-data-[collapsible=icon]:hidden">
                <div className="font-display text-[15px] font-semibold text-foreground">LessonIQ</div>
                <div className="text-[11px] text-muted-foreground">Self-evolving lessons</div>
              </div>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map((item) => {
                    const active = pathname === item.to || (item.to === "/generate" && pathname.startsWith("/runs"));
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link to={item.to}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="rounded-lg border bg-muted/50 p-2.5 text-xs group-data-[collapsible=icon]:hidden">
              <div className="truncate font-medium text-foreground">{me?.profile?.display_name ?? me?.email ?? "Signed in"}</div>
              <div className="truncate text-muted-foreground">{me?.email}</div>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={signOut} tooltip="Sign out">
                  <LogOut />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="bg-background">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">
              {NAV.find((n) => pathname === n.to)?.label ?? (pathname.startsWith("/runs") ? "Generation run" : "")}
            </div>
            <div className="ml-auto">
              <Button asChild size="sm" className="bg-gradient-brand shadow-elevated">
                <Link to="/generate">
                  <Sparkles className="h-4 w-4" /> New lesson
                </Link>
              </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </RunEngineProvider>
  );
}
