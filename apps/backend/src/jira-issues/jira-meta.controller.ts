import {
  Controller,
  Get,
  Inject,
} from "@nestjs/common";
import { JiraIssuesService } from "./jira-issues.service";

@Controller("api/jira/meta")
export class JiraMetaController {
  constructor(
    @Inject(JiraIssuesService) private readonly service: JiraIssuesService,
  ) {}

  @Get()
  list() {
    return this.service.getMeta();
  }
}
