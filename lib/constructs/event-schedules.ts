import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { LambdaFunctionsConstruct } from './lambda-functions';
import { ScheduleConfiguration } from '../config/stack-config';

/**
 * Props for EventSchedulesConstruct
 */
export interface EventSchedulesConstructProps {
  lambdaFunctions: LambdaFunctionsConstruct;
  scheduleConfig: ScheduleConfiguration;
}

/**
 * Construct for creating EventBridge scheduled rules
 * Schedules are configurable via environment variables
 */
export class EventSchedulesConstruct extends Construct {
  public readonly getAulaAndPersistRule: events.Rule;
  public readonly generateNewsletterRule: events.Rule;
  public readonly aulaKeepSessionAliveRule: events.Rule;

  constructor(scope: Construct, id: string, props: EventSchedulesConstructProps) {
    super(scope, id);

    // Parse cron expressions from configuration
    const getAulaCron = this.parseCronExpression(props.scheduleConfig.getAulaSchedule);
    const generateNewsletterCron = this.parseCronExpression(props.scheduleConfig.generateNewsletterSchedule);
    const keepSessionAliveCron = this.parseCronExpression(props.scheduleConfig.keepSessionAliveSchedule);

    // Rule to trigger GetAulaAndPersist Lambda
    this.getAulaAndPersistRule = new events.Rule(this, 'GetAulaAndPersistRule', {
      description: `Trigger GetAulaAndPersist Lambda (schedule: ${props.scheduleConfig.getAulaSchedule})`,
      schedule: events.Schedule.cron(getAulaCron),
    });
    this.getAulaAndPersistRule.addTarget(
      new targets.LambdaFunction(props.lambdaFunctions.getAulaAndPersistFunction)
    );

    // Rule to trigger GenerateNewsletter Lambda
    this.generateNewsletterRule = new events.Rule(this, 'GenerateNewsletterRule', {
      description: `Trigger GenerateNewsletter Lambda (schedule: ${props.scheduleConfig.generateNewsletterSchedule})`,
      schedule: events.Schedule.cron(generateNewsletterCron),
    });
    this.generateNewsletterRule.addTarget(
      new targets.LambdaFunction(props.lambdaFunctions.generateNewsletterFunction)
    );

    // Rule to trigger AulaKeepSessionAlive Lambda
    this.aulaKeepSessionAliveRule = new events.Rule(this, 'AulaKeepSessionAliveRule', {
      description: `Trigger AulaKeepSessionAlive Lambda (schedule: ${props.scheduleConfig.keepSessionAliveSchedule})`,
      schedule: events.Schedule.cron(keepSessionAliveCron),
    });
    this.aulaKeepSessionAliveRule.addTarget(
      new targets.LambdaFunction(props.lambdaFunctions.aulaKeepSessionAliveFunction)
    );
  }

  /**
   * Parses an EventBridge cron expression string into CronOptions
   * EventBridge format: minute hour day-of-month month day-of-week year
   */
  private parseCronExpression(cronExpression: string): events.CronOptions {
    const parts = cronExpression.trim().split(/\s+/);

    // parts[0] = minute, parts[1] = hour, parts[2] = day-of-month,
    // parts[3] = month, parts[4] = day-of-week, parts[5] = year
    return {
      minute: parts[0] !== '*' ? parts[0] : undefined,
      hour: parts[1] !== '*' ? parts[1] : undefined,
      day: parts[2] !== '*' && parts[2] !== '?' ? parts[2] : undefined,
      month: parts[3] !== '*' ? parts[3] : undefined,
      weekDay: parts[4] !== '*' && parts[4] !== '?' ? parts[4] : undefined,
      year: parts[5] !== '*' ? parts[5] : undefined,
    };
  }
}
