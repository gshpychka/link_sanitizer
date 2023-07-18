import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { envVars } from '../src/constants';
import { LinkSanitizer } from '../src/main';

test('LinkSanitizer stack', () => {
  const app = new App();
  const tokenParameterName = 'MyToken';
  const stack = new LinkSanitizer(app, 'test', { telegramTokenParameterName: tokenParameterName });

  const template = Template.fromStack(stack);

  const messageHandlerId = 'Handler886CB40B';
  const messageSenderId = 'MessageSenderC8564C19';

  // Check the snapshot
  expect(template.toJSON()).toMatchSnapshot();

  // Check there is one queue created
  const queues = template.findResources('AWS::SQS::Queue', {});

  expect(Object.keys(queues)).toHaveLength(1);
  const queueId = Object.keys(queues)[0];

  expect(queues).toHaveProperty(queueId);

  // Check there are four Lambda functions created
  // Message Handler, Sender, Webhook Creator Provider & Handler
  const lambdas = template.findResources('AWS::Lambda::Function', {});
  expect(Object.keys(lambdas)).toHaveLength(4);

  const messageHandlerLambda = lambdas[messageHandlerId];
  expect(messageHandlerLambda).toBeDefined();

  const messageSenderLambda = lambdas[messageSenderId];
  expect(messageSenderLambda).toBeDefined();

  // Check URL_BLACK_LIST is a JSON array of strings
  const urlBlackList = JSON.parse(
    messageHandlerLambda.Properties.Environment.Variables[envVars.urlBlackList],
  );
  expect(Array.isArray(urlBlackList)).toBe(true);
  urlBlackList.forEach((item: string) => {
    expect(typeof item).toBe('string');
  });

  expect(
    messageHandlerLambda.Properties.Environment.Variables[
      envVars.messageQueueUrl
    ],
  ).toEqual({ Ref: queueId });

  expect(
    messageSenderLambda.Properties.Environment.Variables[
      envVars.telegramTokenParameterName
    ],
  ).toEqual(tokenParameterName);

  template.hasResource('AWS::Lambda::EventSourceMapping', {
    Properties: {
      EventSourceArn: { 'Fn::GetAtt': [queueId, 'Arn'] },
      FunctionName: { Ref: messageSenderId },
    },
  });

  const messageHandlerRolePolicies = template.findResources('AWS::IAM::Policy', {
    Properties: {
      Roles: [
        {
          Ref: messageHandlerLambda.Properties.Role['Fn::GetAtt'][0],
        },
      ],
    },
  });

  expect(Object.keys(messageHandlerRolePolicies)).toHaveLength(1);

  interface PolicyStatement {
    Action: string | string[];
    Resource: { 'Fn::GetAtt': [string, string] };
  }


  const handlerHasWriteAccessToQueue = Object.values(messageHandlerRolePolicies).some(
    policy => {
      return policy.Properties.PolicyDocument.Statement.some((statement: PolicyStatement) => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('sqs:SendMessage') &&
          statement.Resource['Fn::GetAtt'][0] === queueId;
      },
      );
    });

  expect(handlerHasWriteAccessToQueue).toBe(true);


  const messageSenderRolePolicies = template.findResources('AWS::IAM::Policy', {
    Properties: {
      Roles: [
        {
          Ref: messageSenderLambda.Properties.Role['Fn::GetAtt'][0],
        },
      ],
    },
  });
  const senderHasReadAccessToQueue = Object.values(messageSenderRolePolicies).some(
    policy => {
      return policy.Properties.PolicyDocument.Statement.some((statement: PolicyStatement) => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('sqs:ReceiveMessage') &&
          statement.Resource['Fn::GetAtt'][0] === queueId;
      },
      );
    });

  expect(senderHasReadAccessToQueue).toBe(true);

  const apis = template.findResources('AWS::ApiGateway::RestApi');
  expect(Object.keys(apis)).toHaveLength(1);
  const apiId = Object.keys(apis)[0];

  const deploymentStages = template.findResources('AWS::ApiGateway::Stage', {
    Properties: {
      RestApiId: {
        Ref: apiId,
      },
    },
  });
  expect(Object.keys(deploymentStages)).toHaveLength(1);

  const apiProdStageId = Object.keys(deploymentStages)[0];

  template.hasResource('AWS::ApiGateway::Method', {
    Properties: {
      Integration: {
        IntegrationHttpMethod: 'POST',
        Type: 'AWS_PROXY',
        Uri: {
          'Fn::Join': [
            '',
            [
              'arn:',
              {
                Ref: 'AWS::Partition',
              },
              ':apigateway:',
              {
                Ref: 'AWS::Region',
              },
              ':lambda:path/2015-03-31/functions/',
              {
                'Fn::GetAtt': [
                  messageHandlerId,
                  'Arn',
                ],
              },
              '/invocations',
            ],
          ],
        },
      },
      RestApiId: {
        Ref: apiId,
      },
    },
  });

  template.hasResource('Custom::TelegramBotWebhook', {
    Properties: {
      tokenParameterName: tokenParameterName,
      webhookURL: {
        'Fn::Join': [
          '',
          [
            'https://',
            {
              Ref: apiId,
            },
            '.execute-api.',
            {
              Ref: 'AWS::Region',
            },
            '.',
            {
              Ref: 'AWS::URLSuffix',
            },
            '/',
            {
              Ref: apiProdStageId,
            },
            '/',
          ],
        ],
      },
    },
  });


  const senderHasReadAccessToToken = Object.values(messageSenderRolePolicies).some(
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

  expect(senderHasReadAccessToToken).toBe(true);
});
