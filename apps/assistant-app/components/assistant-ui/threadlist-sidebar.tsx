"use client";

import * as React from "react";
import Image from "next/image";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThreadList } from "@/components/assistant-ui/thread-list";

export function ThreadListSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { user, isLoaded, isSignedIn } = useUser();

  const name = React.useMemo(() => {
    if (!isLoaded) return "Loading…";
    if (!isSignedIn || !user) return "Signed out";

    const first = user.firstName?.trim() ?? "";
    const last = user.lastName?.trim() ?? "";
    const fullFromParts = `${first} ${last}`.trim();

    return (
      fullFromParts ||
      user.fullName?.trim() ||
      user.username?.trim() ||
      "Account"
    );
  }, [isLoaded, isSignedIn, user]);

  const email = React.useMemo(() => {
    if (!isLoaded || !isSignedIn || !user) return "";
    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      ""
    );
  }, [isLoaded, isSignedIn, user]);

  return (
    <Sidebar {...props}>
      <SidebarHeader className="aui-sidebar-header mb-2 border-b">
        <div className="aui-sidebar-header-content flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Image
                      src="/assets/elileai-logo.png"
                      alt="Elile AI"
                      width={24}
                      height={17}
                      className="object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-0 leading-none">
                    <span className="text-sm font-bold tracking-tight text-foreground">Elile AI</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">Deep Research Assistant</span>
                  </div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="aui-sidebar-content px-2">
        <ThreadList />
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter className="aui-sidebar-footer border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex items-center gap-2">
                <div className="aui-sidebar-footer-icon-wrapper flex aspect-square size-8 items-center justify-center">
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: "w-8 h-8",
                      },
                    }}
                  />
                </div>
                <div className="aui-sidebar-footer-heading flex flex-col gap-0.5 leading-none">
                  <span className="aui-sidebar-footer-title font-semibold">
                    {name}
                  </span>
                  {email ? <span>{email}</span> : null}
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
