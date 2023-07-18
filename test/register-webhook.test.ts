import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { TelegramBotWebhook } from '../src/register-webhook';

test('TelegramBotWebhook', () => {
  const app = new App();
  const tokenParameterName = 'MyToken';
  const stack = new Stack(app, 'MyStack');

  const handlerFnId = 'WebhookHandler0697217E';
  const providerFnId = 'WebhookProviderframeworkonEventA9527C6B';
  const webhookUrl = 'example.com';

  const token = ssm.StringParameter.fromSecureStringParameterAttributes(stack, 'MyToken', { parameterName: tokenParameterName });

  new TelegramBotWebhook(stack, 'Webhook', { webhookUrl: webhookUrl, telegramToken: { parameter: token } });

  const template = Template.fromStack(stack);


  // Check the snapshot
  expect(template.toJSON()).toMatchSnapshot();

  // Check there are two Lambda functions created
  // Webhook Creator Provider & Handler
  const lambdas = template.findResources('AWS::Lambda::Function', {});
  expect(Object.keys(lambdas)).toHaveLength(2);

  const handlerLambda = lambdas[handlerFnId];
  expect(handlerLambda).toBeDefined();

  const providerLambda = lambdas[providerFnId];
  expect(providerLambda).toBeDefined();

  template.hasResource('Custom::TelegramBotWebhook', {
    Properties: {
      ServiceToken: { 'Fn::GetAtt': [providerFnId, 'Arn'] },
      tokenParameterName: tokenParameterName,
      webhookURL: webhookUrl,
    },
  });

  const handlerRolePolicies = template.findResources('AWS::IAM::Policy', {
    Properties: {
      Roles: [
        {
          Ref: handlerLambda.Properties.Role['Fn::GetAtt'][0],
        },
      ],
    },
  });

  interface PolicyStatement {
    Action: string | string[];
    Resource: any;
  }


  const handlerHasReadAccessToToken = Object.values(handlerRolePolicies).some(
    policy => {
      return policy.Properties.PolicyDocument.Statement.some((statement: PolicyStatement) => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('ssm:GetParameter') &&
          JSON.stringify(statement.Resource) === JSON.stringify(
            {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':ssm:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  `:parameter/${tokenParameterName}`,
                ],
              ],
            });
      },
      );
    });

  expect(handlerHasReadAccessToToken).toBe(true);

});
