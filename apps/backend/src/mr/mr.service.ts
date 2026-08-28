import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { MrRepository } from './mr.repository';
import { encodeMrId } from '@/jira-issues/jira-mapping';

@Injectable()
export class MRService extends EventEmitter {
  constructor(
    @Inject(MrRepository) private readonly mrRepository: MrRepository,
  ) {
    super();
  }

  public async listMrs() {
    return (await this.mrRepository.listMrs()).map((mr) => ({
      ...mr,
      mrId: encodeMrId(mr.gitlabUrl),
    }));
  }
}
