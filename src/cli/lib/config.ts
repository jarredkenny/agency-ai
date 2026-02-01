export function getConfig() {
  const apiUrl = process.env.AGENCY_API_URL ?? "http://localhost:3100";
  const agentName = process.env.AGENCY_AGENT_NAME ?? "";
  return { apiUrl, agentName };
}
