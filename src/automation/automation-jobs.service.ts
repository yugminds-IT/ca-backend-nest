import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationService } from './automation.service';
import { SequenceRunnerService } from './sequence-runner.service';
import { WorkflowRunnerService } from './workflow-runner.service';

/**
 * Time-based automation: overdue first responses, inactive leads, overdue follow-ups and sequence steps.
 * Runs every 5 minutes. A run that is still going when the next tick arrives is skipped, so runs never overlap.
 */
@Injectable()
export class AutomationJobsService {
  private readonly logger = new Logger(AutomationJobsService.name);
  private running = false;

  constructor(
    private readonly automation: AutomationService,
    private readonly workflows: WorkflowRunnerService,
    private readonly sequences: SequenceRunnerService,
  ) {}

  @Cron('*/5 * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const escalated = await this.automation.escalateOverdueFirstResponses(now);
      const fired = await this.workflows.runTimeBased(now);
      const seq = await this.sequences.processDue(now);
      if (escalated || fired || seq.processed) {
        this.logger.log(
          `Automation: escalated ${escalated}, workflows fired ${fired}, sequence steps sent ${seq.sent}, enrollments stopped ${seq.stopped}`,
        );
      }
    } catch (err) {
      this.logger.error(`Automation tick failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }
}
