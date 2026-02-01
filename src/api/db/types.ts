import type { Generated } from "kysely";

export interface Database {
  agents: AgentTable;
  tasks: TaskTable;
  task_assignees: TaskAssigneeTable;
  messages: MessageTable;
  activities: ActivityTable;
  notifications: NotificationTable;
  documents: DocumentTable;
  knowledge: KnowledgeTable;
  settings: SettingsTable;
  skills: SkillsTable;
  role_configs: RoleConfigsTable;
}

export interface AgentTable {
  id: Generated<string>;
  name: string;
  role: string;
  status: string;
  current_task: string | null;
  location: string | null;
  slack_bot_token: string | null;
  slack_app_token: string | null;
  session_key: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface TaskTable {
  id: Generated<string>;
  title: string;
  description: string;
  design: string | null;
  acceptance: string | null;
  status: string;
  priority: number;
  task_type: string;
  parent_id: string | null;
  created_by: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface TaskAssigneeTable {
  task_id: string;
  agent_id: string;
}

export interface MessageTable {
  id: Generated<string>;
  task_id: string;
  from_agent: string;
  content: string;
  created_at: Generated<string>;
}

export interface ActivityTable {
  id: Generated<string>;
  type: string;
  agent_id: string;
  task_id: string | null;
  summary: string;
  created_at: Generated<string>;
}

export interface NotificationTable {
  id: Generated<string>;
  target_agent: string;
  source_agent: string | null;
  task_id: string | null;
  content: string;
  delivered: Generated<number>;
  created_at: Generated<string>;
}

export interface DocumentTable {
  id: Generated<string>;
  title: string;
  content: string;
  doc_type: string;
  task_id: string | null;
  created_by: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface KnowledgeTable {
  id: Generated<string>;
  key: string;
  content: string;
  source: string;
  task_id: string | null;
  tags: string;
  created_at: Generated<string>;
}

export interface SettingsTable {
  key: string;
  value: string;
  category: string;
  description: string | null;
  sensitive: number;
  input_type: string;
  updated_at: Generated<string>;
}

export interface SkillsTable {
  id: string;
  name: string;
  body: string;
  category: string;
  tags: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface RoleConfigsTable {
  id: string;
  role: string;
  config_type: string;
  content: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
