"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Database,
  HardDrive,
  Bell,
  LogOut,
  HelpCircle,
  KeyRound,
  Building2,
  Code2,
  ClipboardList,
  Moon,
  Sun,
  Monitor,
  Key,
  Users,
  TriangleAlert,
  ListTodo,
} from "lucide-react"

import { Link } from "react-router-dom"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { useTheme } from "@/components/theme-provider"
import { Logo } from "@/components/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getLicenseStatus, type LicenseStatus } from "@/lib/api"

const navMain = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    isActive: true,
  },
  {
    title: "Backup Jobs",
    url: "/backup-jobs",
    icon: Database,
  },
  {
    title: "Destinations",
    url: "/destinations",
    icon: HardDrive,
  },
  {
    title: "Credentials",
    url: "/credential-providers",
    icon: Key,
  },
  {
    title: "Notifications",
    url: "/notifications",
    icon: Bell,
  },
  ]

const baseNavSettings = [
  {
    title: "Audit Log",
    url: "/audit-log",
    icon: ClipboardList,
  },
  {
    title: "Queue",
    url: "/settings",
    icon: ListTodo,
  },
  {
    title: "License",
    url: "/license",
    icon: KeyRound,
  },
]

const teamNavItem = {
  title: "Team",
  url: "/team",
  icon: Users,
}

const navDocs = [
  {
    title: "Help",
    url: "/help",
    icon: HelpCircle,
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: {
    email: string;
    name?: string;
  };
  onLogout: () => void;
}

export function AppSidebar({ user, onLogout, ...props }: AppSidebarProps) {
  const [licenseStatus, setLicenseStatus] = React.useState<LicenseStatus | null>(null);
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    getLicenseStatus()
      .then(setLicenseStatus)
      .catch(() => {
        // Silently fail - license status is optional
      });
  }, []);

  // Build navSettings based on license - show Team if seats > 1 or unlimited (-1)
  const navSettings = React.useMemo(() => {
    const hasTeamAccess = licenseStatus?.valid && licenseStatus.seats !== null && (licenseStatus.seats === -1 || licenseStatus.seats > 1);
    if (hasTeamAccess) {
      return [teamNavItem, ...baseNavSettings];
    }
    return baseNavSettings;
  }, [licenseStatus]);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-3 px-2 py-3 rounded-md hover:bg-sidebar-accent transition-colors">
          <Logo size="lg" className="text-foreground dark:text-sidebar-primary-foreground shrink-0" />
          <div className="grid flex-1 text-left leading-tight">
            <span className="truncate font-semibold text-base">Stashd</span>
            <span className="truncate text-sm text-muted-foreground">
              {licenseStatus?.valid && licenseStatus.company
                ? licenseStatus.company
                : 'Backup Manager'}
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavMain items={navSettings} label="System" />
        <NavMain items={navDocs} label="Documentation" />
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 mb-2 space-y-2">
          {import.meta.env.DEV && (
            <div className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-xs text-white">
              <TriangleAlert className="size-4" />
              <span className="font-medium">Development Mode</span>
            </div>
          )}
          {licenseStatus?.valid && licenseStatus.company ? (
            <Link to="/license" className="flex items-center gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-xs">
              <Building2 className="size-4 text-green-600" />
              <span className="truncate text-green-700 dark:text-green-400">
                {licenseStatus.company}
              </span>
            </Link>
          ) : (
            <Link to="/license" className="flex items-center gap-2 rounded-md border border-muted-foreground/30 bg-muted/50 px-3 py-2 text-xs">
              <Code2 className="size-4 text-muted-foreground" />
              <span className="truncate text-muted-foreground">
                Open Source Edition
              </span>
            </Link>
          )}
        </div>
        <NavUser user={{ name: user.name || user.email.split('@')[0], email: user.email, avatar: "" }} />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                if (theme === 'light') setTheme('dark');
                else if (theme === 'dark') setTheme('system');
                else setTheme('light');
              }}
            >
              {theme === 'light' && <Sun className="size-4" />}
              {theme === 'dark' && <Moon className="size-4" />}
              {theme === 'system' && <Monitor className="size-4" />}
              <span className="capitalize">{theme}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout}>
              <LogOut className="size-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
