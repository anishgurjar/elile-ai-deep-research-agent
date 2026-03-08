"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  unstable_useRemoteThreadListRuntime as useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ElileaiThreadListAdapter } from "./elileai-adapter";
import { useElileaiExternalRuntime } from "./use-elileai-runtime";
import { SubagentsPanel } from "./subagents-panel";
import { SubagentPanelProvider } from "./subagent-panel-context";

export function CustomThreadListProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useElileaiExternalRuntime,
    adapter: ElileaiThreadListAdapter,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export function MyAssistant() {
  return (
    <CustomThreadListProvider>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbPage>Assist</BreadcrumbPage>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <SubagentPanelProvider>
              <div className="flex-1 overflow-hidden flex">
                <div className="flex-1 min-w-0">
                  <Thread />
                </div>
                <SubagentsPanel />
              </div>
            </SubagentPanelProvider>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </CustomThreadListProvider>
  );
}
