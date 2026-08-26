import { Module } from "@nestjs/common";
import { ClaudeModule } from "../claude/claude.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { JiraIssuesRepository } from "./jira-issues.repository";
import { JiraIssuesService } from "./jira-issues.service";
import { JiraIssuesController } from "./jira-issues.controller";
import { SyncedIssuesController } from "./synced-issues.controller";
import { JiraMrController } from "./jira-mr.controller";
import { JiraMetaController } from "./jira-meta.controller";

/**
 * "Jira Issues" web page backend (docs/BACKEND_SPEC.md). Imports MrModule
 * only to reuse its already-configured JiraClient/GitlabClient providers —
 * this module owns its own DB tables and services, entirely separate from
 * the MR Management feature MrModule otherwise implements. ClaudeModule and
 * WorkspaceModule back the real review job (stage 5) — see
 * jira-issues.service.ts's triggerReview. Exports JiraIssuesService so
 * WsModule can forward its jira.review.* events over the shared /ws
 * connection (see ws/mr.gateway.ts).
 */
@Module({
  imports: [ClaudeModule, WorkspaceModule],
  controllers: [
    JiraIssuesController,
    SyncedIssuesController,
    JiraMrController,
    JiraMetaController,
  ],
  providers: [JiraIssuesRepository, JiraIssuesService],
  exports: [JiraIssuesService],
})
export class JiraIssuesModule {}
