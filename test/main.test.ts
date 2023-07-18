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
  const queueId = 'MessageQueue7A3BF959';

  // Check the snapshot
  expect(template.toJSON()).toMatchSnapshot();

  // Check there is one queue created
  const queues = template.findResources('AWS::SQS::Queue', {});

  expect(Object.keys(queues)).toHaveLength(1);

  expect(queues).toHaveProperty(queueId);

  // Check there are two Lambda functions created
  const lambdas = template.findResources('AWS::Lambda::Function', {});
  expect(Object.keys(lambdas)).toHaveLength(2);

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

  const eventSourceMappings = template.findResources('AWS::Lambda::EventSourceMapping', {
    Properties: {
      EventSourceArn: { 'Fn::GetAtt': [queueId, 'Arn'] },
      FunctionName: { Ref: messageSenderId },
    },
  });
  expect(Object.keys(eventSourceMappings)).toHaveLength(1);


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

});
