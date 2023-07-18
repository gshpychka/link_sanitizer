import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as event_sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { envVars } from './constants';
import { HandleMessageFunction } from './handle-message-function';
import { SendMessageFunction } from './send-message-function';

interface LinkSanitizerProps extends StackProps {
  telegramTokenParameterName: string;
}
export class LinkSanitizer extends Stack {
  private readonly telegramToken: ssm.IStringParameter;
  constructor(scope: Construct, id: string, props: LinkSanitizerProps) {
    super(scope, id, props);

    this.telegramToken = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'TelegramToken', {
        parameterName: props.telegramTokenParameterName,
      });

    const messageQueue = new sqs.Queue(this, 'MessageQueue');

    const messageHandler = new HandleMessageFunction(this, 'Handler', {
      environment: {
        [envVars.urlBlackList]: JSON.stringify(
          [
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_name',
            'utm_term',
            'utm_content',
            'gclid',
            'fbclid',
            'igshid',
            'mc_eid',
            'mc_cid',
            '_hsenc',
            '_hsmi',
            'hsCtaTracking',
            't',
          ]),
        [envVars.messageQueueUrl]: messageQueue.queueUrl,
      },
      retryAttempts: 0,
    });

    const messageSender = new SendMessageFunction(this, 'MessageSender', {
      retryAttempts: 0,
      environment: {
        [envVars.telegramTokenParameterName]: this.telegramToken.parameterName,
      },
    });

    this.telegramToken.grantRead(messageSender);

    messageQueue.grantSendMessages(messageHandler);

    const queueSource = new event_sources.SqsEventSource(messageQueue,
      { batchSize: 1, maxConcurrency: 2 },
    );
    messageSender.addEventSource(queueSource);
    new apigw.LambdaRestApi(this, 'Api', { handler: messageHandler, proxy: true });
  }
}

const app = new App();

new LinkSanitizer(app, 'LinkSanitizer', {
  telegramTokenParameterName: '/link-sanitizer/telegram-token',
});

app.synth();
