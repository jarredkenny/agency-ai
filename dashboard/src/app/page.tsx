"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { Header, type View } from "@/components/header";
import { AgentSidebar, type Agent } from "@/components/agent-sidebar";
import { TaskBoard } from "@/components/task-board";
import { LiveFeed } from "@/components/live-feed";
import { AgentConfig } from "@/components/agent-config";
import { SettingsEditor } from "@/components/settings-editor";
import { SkillsEditor } from "@/components/skills-editor";
import { RoleConfigEditor } from "@/components/role-config-editor";

export default function Home() {
  const [view, setView] = useState<View>("mission");
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const load = () => fetchApi("/agents").then(setAgents).catch(console.error);
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <Header activeView={view} onViewChange={setView} />
      {view === "mission" ? (
        <div className="flex flex-1 overflow-hidden">
          <AgentSidebar agents={agents} />
          <TaskBoard />
          <LiveFeed />
        </div>
      ) : view === "config" ? (
        <AgentConfig agents={agents} />
      ) : view === "settings" ? (
        <SettingsEditor />
      ) : view === "skills" ? (
        <SkillsEditor />
      ) : view === "roles" ? (
        <RoleConfigEditor />
      ) : null}
    </div>
  );
}
