import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib/core';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { RegisterWebhookFunction } from './register-webhook-function';

export interface TelegramTokenProps {
  parameter: ssm.IStringParameter;
  version?: string | undefined;
}

export interface TelegramBotWebhookProps {
  telegramToken: TelegramTokenProps;
  webhookUrl: string;
}


export interface TelegramWebhookResourceProperties {
  tokenParameterName: string;
  webhookURL: string;
}


export class TelegramBotWebhook extends Construct {
  constructor(scope: Construct, id: string, props: TelegramBotWebhookProps) {
    super(scope, id);

    const tokenParameterName = props.telegramToken.version ?
      `${props.telegramToken.parameter.parameterName}:${props.telegramToken.version}`
      : props.telegramToken.parameter.parameterName;

    const handler = new RegisterWebhookFunction(this, 'Handler');

    props.telegramToken.parameter.grantRead(handler);


    const provider = new cr.Provider(this, 'Provider', { onEventHandler: handler });

    new cdk.CustomResource(this, 'Default', {
      resourceType: 'Custom::TelegramBotWebhook',
      serviceToken: provider.serviceToken,
      properties: {
        tokenParameterName: tokenParameterName,
        webhookURL: props.webhookUrl,
      } satisfies TelegramWebhookResourceProperties,
    },
    );
  }

}
